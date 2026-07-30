import { expect, test } from 'bun:test';

import { DEFAULTS, loadProjectConfig } from '../src/core/config';
import { settingsRows } from '../src/app/settingsRows';
import { resolveServer } from '../src/lsp/servers';
import { fixture } from './helpers';

test('language server resolution applies overrides and disables empty commands', () => {
	expect(resolveServer('typescript', {})?.command[0]).toBe('typescript-language-server');
	expect(resolveServer('typescriptreact', {})?.id).toBe('typescript');
	expect(resolveServer('typescript', { typescript: ['deno', 'lsp'] })?.command).toEqual([
		'deno',
		'lsp',
	]);
	expect(resolveServer('typescript', { typescript: [] })).toBeNull();
	expect(resolveServer('brainfuck', {})).toBeNull();
	expect(resolveServer(undefined, {})).toBeNull();
});

test('LSP settings parse and appear in settings rows', () => {
	const rows = settingsRows(
		{
			...DEFAULTS,
			lsp: true,
			lspCompletion: false,
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
	expect(rows.find((row) => row.label === 'Language server overrides')?.value).toBe('1 overridden');
	expect(DEFAULTS.lsp).toBe(false);
});

test('LSP settings parse from project config', () => {
	const dir = fixture({
		'a.ts': 'const a = 1\n',
		'.dune/settings.json': JSON.stringify({
			lsp: true,
			lspCompletion: false,
			lspServers: { typescript: ['deno', 'lsp'], bogus: [1] },
		}),
	});

	expect(loadProjectConfig(dir)).toMatchObject({
		lsp: true,
		lspCompletion: false,
		lspServers: { typescript: ['deno', 'lsp'] },
	});
});
