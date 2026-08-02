import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { reloadAppearancePlugins } from '../src/app/appearance/reload';
import { DEFAULTS } from '../src/core/config';
import { loadLocalLspServers } from '../src/core/plugins/localLspServers';

test('local plugin manifests can contribute language servers', () => {
	const dir = project({
		'.dune/plugins/kotlin/plugin.json': JSON.stringify({
			id: 'kotlin-tools',
			version: '1.0.0',
			languageServers: [
				{
					id: 'kotlin',
					command: ['kotlin-language-server'],
					filetypes: ['kotlin'],
					install: { kind: 'manual', command: 'brew install kotlin-language-server' },
				},
			],
		}),
	});

	expect(loadLocalLspServers(dir, join(dir, 'empty'))).toEqual({
		servers: [
			{
				id: 'kotlin',
				command: ['kotlin-language-server'],
				filetypes: ['kotlin'],
				install: { kind: 'manual', command: 'brew install kotlin-language-server' },
			},
		],
		problems: [],
	});
});

test('invalid language server contributions are skipped with a problem', () => {
	const dir = project({
		'.dune/plugins/bad/plugin.json': JSON.stringify({
			id: 'bad-tools',
			version: '1.0.0',
			languageServers: [{ id: 'bad tools', command: [], filetypes: ['bad'] }],
		}),
	});
	const loaded = loadLocalLspServers(dir, join(dir, 'empty'));

	expect(loaded.servers).toEqual([]);
	expect(loaded.problems).toHaveLength(1);
	expect(loaded.problems[0]?.reason).toBe('invalid language server');
});

test('plugin reload refreshes language server manifests', () => {
	const dir = project({
		'.dune/plugins/kotlin/plugin.json': JSON.stringify({
			id: 'kotlin-tools',
			version: '1.0.0',
			languageServers: [
				{ id: 'kotlin', command: ['kotlin-language-server'], filetypes: ['kotlin'] },
			],
		}),
	});
	let servers: unknown[] = [];
	const messages: string[] = [];

	reloadAppearancePlugins({
		rootDir: dir,
		config: DEFAULTS,
		setAppearancePlugins: () => undefined,
		setLspServers: (next) => (servers = [...next]),
		lsp: { restart: () => true },
		say: (msg) => messages.push(msg),
	});

	expect(servers).toEqual([
		{ id: 'kotlin', command: ['kotlin-language-server'], filetypes: ['kotlin'] },
	]);
	expect(messages).toEqual(['Reloaded plugins and restarted language servers']);
});

function project(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), 'dune-lsp-plugins-'));
	for (const [name, content] of Object.entries(files)) {
		const path = join(dir, name);
		mkdirSync(join(path, '..'), { recursive: true });
		writeFileSync(path, content);
	}
	return dir;
}
