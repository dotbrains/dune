import { afterAll, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const dist = mkdtempSync(join(tmpdir(), 'dune-release-'));

afterAll(() => rmSync(dist, { recursive: true, force: true }));

test('release artifacts carry PDF notices', () => {
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
});
