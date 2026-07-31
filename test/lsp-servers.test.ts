import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULTS, loadProjectConfig } from '../src/core/config';
import { settingsRows } from '../src/app/settingsRows';
import { projectCommand, typescriptMajor } from '../src/lsp/project';
import { installHint, resolveServer } from '../src/lsp/servers';
import { fixture } from './helpers';

test('language server resolution applies overrides and disables empty commands', () => {
	expect(resolveServer('typescript', {})?.command[0]).toBe('typescript-language-server');
	expect(resolveServer('typescript', {})?.install).toEqual({
		kind: 'npm',
		packages: ['typescript-language-server', 'typescript@5'],
	});
	expect(resolveServer('typescriptreact', {})?.id).toBe('typescript');
	expect(resolveServer('typescript', { typescript: ['deno', 'lsp'] })?.command).toEqual([
		'deno',
		'lsp',
	]);
	expect(resolveServer('typescript', { typescript: ['deno', 'lsp'] })?.install).toBeUndefined();
	expect(resolveServer('typescript', { typescript: [] })).toBeNull();
	expect(resolveServer('brainfuck', {})).toBeNull();
	expect(resolveServer(undefined, {})).toBeNull();
	expect(installHint({ kind: 'manual', command: 'rustup component add rust-analyzer' })).toBe(
		'rustup component add rust-analyzer',
	);
	expect(installHint({ kind: 'npm', packages: ['pyright'] })).toBe('npm i -g pyright');
});

test('LSP settings parse and appear in settings rows', () => {
	const rows = settingsRows(
		{
			...DEFAULTS,
			lsp: true,
			lspCompletion: false,
			lspInline: false,
			typescriptTsdk: '/opt/typescript/lib',
			lspServers: { typescript: ['deno', 'lsp'] },
		},
		{
			applyTheme: () => {},
			applyTabSize: () => {},
			applyVim: () => {},
			editFormatter: () => {},
			editKeybinding: () => {},
			editSidebarWidth: () => {},
			toggleThemeSync: () => {},
			toggleAutoSave: () => {},
			toggleTransparent: () => {},
			toggleDotfiles: () => {},
			toggleGitignored: () => {},
			toggleFormat: () => {},
			toggleTrim: () => {},
			patchConfig: () => {},
			configScope: () => 'user',
		},
	);

	expect(rows.find((row) => row.label === 'Language servers')?.value).toBe('on');
	expect(rows.find((row) => row.label === 'Autocomplete')?.value).toBe('off');
	expect(rows.find((row) => row.label === 'Inline problem text')?.value).toBe('off');
	expect(rows.find((row) => row.label === 'TypeScript SDK')?.value).toBe('/opt/typescript/lib');
	expect(rows.find((row) => row.label === 'Language server overrides')?.value).toBe('1 overridden');
	expect(DEFAULTS.lsp).toBe(false);
});

test('LSP settings parse from project config', () => {
	const dir = fixture({
		'a.ts': 'const a = 1\n',
		'.dune/settings.json': JSON.stringify({
			lsp: true,
			lspCompletion: false,
			lspInline: false,
			typescriptTsdk: '/workspace/typescript/lib',
			lspServers: { typescript: ['deno', 'lsp'], bogus: [1] },
		}),
	});

	expect(loadProjectConfig(dir)).toMatchObject({
		lsp: true,
		lspCompletion: false,
		lspInline: false,
		typescriptTsdk: '/workspace/typescript/lib',
		lspServers: { typescript: ['deno', 'lsp'] },
	});
});

test('language server resolution prefers project-local executables', () => {
	const dir = project({
		'node_modules/.bin/typescript-language-server': '',
		'node_modules/typescript/package.json': '{"version":"5.9.2"}',
	});

	expect(typescriptMajor(dir)).toBe(5);
	expect(projectCommand('typescript', ['typescript-language-server', '--stdio'], dir)).toEqual([
		join(dir, 'node_modules', '.bin', 'typescript-language-server'),
		'--stdio',
	]);
});

test('typescript 7 projects use tsc as the language server', () => {
	const dir = project({
		'node_modules/.bin/tsc': '',
		'node_modules/.bin/typescript-language-server': '',
		'node_modules/typescript/package.json': '{"version":"7.0.2"}',
	});

	expect(typescriptMajor(dir)).toBe(7);
	expect(projectCommand('typescript', ['typescript-language-server', '--stdio'], dir)).toEqual([
		join(dir, 'node_modules', '.bin', 'tsc'),
		'--lsp',
		'--stdio',
	]);
});

test('typescript 5 projects do not use tsc as the language server', () => {
	const dir = project({
		'node_modules/.bin/tsc': '',
		'node_modules/typescript/package.json': '{"version":"5.9.2"}',
	});

	expect(projectCommand('typescript', ['typescript-language-server', '--stdio'], dir)).toBeNull();
});

function project(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), 'dune-lsp-project-'));
	for (const [name, content] of Object.entries(files)) {
		const path = join(dir, name);
		mkdirSync(join(path, '..'), { recursive: true });
		writeFileSync(path, content);
	}
	return dir;
}
