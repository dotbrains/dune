import { afterEach, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { availablePackageManagers, hasNodeRuntime, installServer } from '../../src/lsp/install';

const originalPath = process.env.PATH;
const roots: string[] = [];

afterEach(() => {
	process.env.PATH = originalPath;
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	roots.push(dir);
	return dir;
}

function bin(dir: string, name: string, body = ''): void {
	const path = join(dir, name);
	writeFileSync(path, `#!/bin/sh\n${body}\n`);
	chmodSync(path, 0o755);
}

test('available package managers require node and prefer npm, bun, then pnpm', () => {
	const dir = tempDir('dune-lsp-bin-');
	bin(dir, 'node');
	bin(dir, 'pnpm');
	bin(dir, 'bun');
	process.env.PATH = dir;

	expect(hasNodeRuntime()).toBe(true);
	expect(availablePackageManagers()).toEqual(['bun', 'pnpm']);

	bin(dir, 'npm');
	expect(availablePackageManagers()).toEqual(['npm', 'bun', 'pnpm']);
});

test('available package managers stick to the manager that owns the prefix', async () => {
	const binDir = tempDir('dune-lsp-bin-');
	const root = tempDir('dune-lsp-root-');
	bin(binDir, 'node');
	bin(binDir, 'npm');
	bin(binDir, 'bun');
	process.env.PATH = binDir;

	await installServer(['typescript-language-server'], root, 'bun');

	expect(availablePackageManagers(root)).toEqual(['bun']);
	expect(readFileSync(join(root, '.manager'), 'utf8')).toBe('bun');
});

test('install server uses the selected package manager and creates the prefix', async () => {
	const binDir = tempDir('dune-lsp-bin-');
	const root = join(tempDir('dune-lsp-parent-'), 'missing', 'lsp');
	const marker = tempDir('dune-lsp-marker-');
	bin(binDir, 'node');
	bin(binDir, 'pnpm', `echo "$@" > "${join(marker, 'args')}"`);
	process.env.PATH = binDir;

	const error = await installServer(['pyright'], root, 'pnpm');

	expect(error).toBeNull();
	expect(readFileSync(join(marker, 'args'), 'utf8').trim()).toBe(`add --dir ${root} pyright`);
	expect(readFileSync(join(root, '.manager'), 'utf8')).toBe('pnpm');
});

test('install server keeps a manifest so later installs do not prune the prefix', async () => {
	const binDir = tempDir('dune-lsp-bin-');
	const root = tempDir('dune-lsp-root-');
	const marker = tempDir('dune-lsp-marker-');
	bin(binDir, 'node');
	bin(binDir, 'npm', `echo "$@" > "${join(marker, 'args')}"`);
	process.env.PATH = binDir;

	const installed = join(root, 'node_modules', 'typescript-language-server');
	mkdirSync(installed, { recursive: true });
	writeFileSync(
		join(installed, 'package.json'),
		JSON.stringify({ name: 'typescript-language-server', version: '4.4.1' }),
	);

	const error = await installServer(['pyright'], root, 'npm');

	expect(error).toBeNull();
	expect(readFileSync(join(marker, 'args'), 'utf8').trim()).toBe(
		`install --prefix ${root} --no-audit --no-fund pyright`,
	);
	expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))).toEqual({
		name: 'dune-language-servers',
		version: '0.0.0',
		private: true,
		dependencies: { 'typescript-language-server': '4.4.1' },
	});
});
