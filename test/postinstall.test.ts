import { afterAll, describe, expect, test } from 'bun:test';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { createServer } from 'node:http';

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
