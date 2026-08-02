import { afterAll, describe, expect, test } from 'bun:test';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const neverResponds = createServer(() => {});
const neverFinishes = createServer((_request, response) => {
	response.writeHead(200, { 'content-type': 'application/octet-stream' });
	response.write('partial');
});
const notFound = createServer((_request, response) => {
	response.writeHead(404);
	response.end();
});

const servers = [neverResponds, neverFinishes, notFound];

for (const server of servers) server.listen(0, '127.0.0.1');
await Promise.all(servers.map((server) => once(server, 'listening')));

function portOf(server: Server): number {
	const address = server.address();
	if (address && typeof address === 'object') return address.port;
	throw new Error('server did not bind to a TCP port');
}

function close(server: Server): Promise<void> {
	server.closeAllConnections();
	return new Promise((resolve, reject) => {
		server.close((error) => {
			if (error && !('code' in error && error.code === 'ERR_SERVER_NOT_RUNNING')) reject(error);
			else resolve();
		});
	});
}

afterAll(async () => {
	await Promise.all(servers.map(close));
});

const root = join(import.meta.dir, '..');

async function binaryAgainst(server: Server) {
	const port = portOf(server);
	process.env.DUNE_DOWNLOAD_BASE = `http://127.0.0.1:${port}`;
	return import(`../bin/binary.mjs?server=${port}`);
}

describe('install-time binary download', () => {
	test('the current platform has a release asset to exercise', async () => {
		const { supported } = await binaryAgainst(notFound);
		expect(supported).toBe(true);
	});

	test('returns when the server accepts the connection but sends no headers', async () => {
		const { fetchBinary } = await binaryAgainst(neverResponds);
		const started = Date.now();

		expect(await fetchBinary({ timeout: 250 })).toBeNull();

		const elapsed = Date.now() - started;
		expect(elapsed).toBeGreaterThanOrEqual(200);
		expect(elapsed).toBeLessThan(5_000);
	});

	test('returns when the server sends headers but never completes the body', async () => {
		const { fetchBinary } = await binaryAgainst(neverFinishes);
		const started = Date.now();

		expect(await fetchBinary({ timeout: 250 })).toBeNull();

		const elapsed = Date.now() - started;
		expect(elapsed).toBeGreaterThanOrEqual(200);
		expect(elapsed).toBeLessThan(5_000);
	});

	test('does not wait for the timeout when the server answers immediately', async () => {
		const { fetchBinary } = await binaryAgainst(notFound);
		const started = Date.now();

		expect(await fetchBinary({ timeout: 60_000 })).toBeNull();

		expect(Date.now() - started).toBeLessThan(5_000);
	});
});

test('release artifacts carry PDF notices', () => {
	const dist = mkdtempSync(join(tmpdir(), 'dune-release-'));
	try {
		mkdirSync(join(dist, 'windows-x64'), { recursive: true });
		writeFileSync(join(dist, 'windows-x64', 'dune.exe'), 'test binary');
		mkdirSync(join(dist, 'linux-x64'), { recursive: true });
		writeFileSync(join(dist, 'linux-x64', 'dune'), 'test binary');

		const result = Bun.spawnSync({
			cmd: [process.execPath, 'run', 'scripts/release.ts', 'windows-x64', 'linux-x64'],
			cwd: root,
			env: { ...process.env, DUNE_DIST: dist },
			stdout: 'pipe',
			stderr: 'pipe',
		});

		expect(result.stderr.toString()).toBe('');
		expect(result.exitCode).toBe(0);
		const archive = readFileSync(join(dist, 'release/dune-windows-x64.zip')).toString('latin1');
		expect(archive).toContain('THIRD_PARTY_NOTICES.md');
		expect(archive).toContain('PDFIUM_LICENSE');
		expect(archive).toContain('HYZYLA_PDFIUM_LICENSE');
		const tar = Bun.spawnSync({
			cmd: ['tar', '-tzf', join(dist, 'release/dune-linux-x64.tar.gz')],
			stdout: 'pipe',
			stderr: 'pipe',
		});
		expect(tar.stderr.toString()).toBe('');
		expect(tar.stdout.toString()).toContain('THIRD_PARTY_NOTICES.md');
		expect(tar.stdout.toString()).toContain('third_party/PDFIUM_LICENSE');
		expect(tar.stdout.toString()).toContain('third_party/HYZYLA_PDFIUM_LICENSE');

		const npm = join(dist, 'npm/dune');
		expect(existsSync(join(npm, 'THIRD_PARTY_NOTICES.md'))).toBe(true);
		expect(existsSync(join(npm, 'PDFIUM_LICENSE'))).toBe(true);
		expect(existsSync(join(npm, 'HYZYLA_PDFIUM_LICENSE'))).toBe(true);
		const notice = readFileSync(join(npm, 'THIRD_PARTY_NOTICES.md'), 'utf8');
		expect(notice).toContain('@hyzyla/pdfium');
		expect(notice).toContain('PDFium');
		expect(JSON.parse(readFileSync(join(npm, 'package.json'), 'utf8')).files).toEqual([
			'bin',
			'THIRD_PARTY_NOTICES.md',
			'PDFIUM_LICENSE',
			'HYZYLA_PDFIUM_LICENSE',
		]);
	} finally {
		rmSync(dist, { recursive: true, force: true });
	}
});
