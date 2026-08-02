import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRoot, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

import { createAppLsp, problemFrom, wireAppLspEffects } from '../src/app/lsp/index';
import type { BufferState, Prompt } from '../src/app/types';
import { DEFAULTS } from '../src/core/config';

const FAKE = join(import.meta.dir, 'fixtures', 'fake-lsp.ts');

const disposers: Array<() => void> = [];

afterEach(() => {
	for (const dispose of disposers.splice(0)) dispose();
});

const waitFor = async (done: () => boolean, attempts = 40): Promise<void> => {
	if (done() || attempts <= 0) return;
	await new Promise((resolve) => setTimeout(resolve, 25));
	return waitFor(done, attempts - 1);
};

function project(name = 'a.ts') {
	const dir = mkdtempSync(join(tmpdir(), 'dune-app-lsp-'));
	const path = join(dir, name);
	writeFileSync(path, 'const oops = 1\n');
	return { dir, path };
}

function runLsp(content = 'const oops = 1\n') {
	const { dir, path } = project();
	return createRoot((dispose) => {
		disposers.push(dispose);
		const [tabs, setTabs] = createSignal([path]);
		const [buffers, setBuffers] = createStore<Record<string, BufferState>>({
			[path]: { content, dirty: false, mtime: 0 },
		});
		const warnings: string[] = [];
		const config = { ...DEFAULTS, lsp: true, lspServers: { typescript: ['bun', FAKE] } };
		const lsp = createAppLsp({
			rootDir: dir,
			config,
			say: (msg) => warnings.push(msg),
		});
		wireAppLspEffects({ lsp, config, tabs, buffers });
		return { path, lsp, warnings, setTabs, setBuffers };
	});
}

test('app LSP syncs open buffers into diagnostics', async () => {
	const { path, lsp } = runLsp();
	await waitFor(() => lsp.problems[path]?.length === 1);

	expect(lsp.problems[path]?.[0]).toMatchObject({
		path,
		line: 0,
		col: 6,
		endLine: 0,
		endCol: 10,
		severity: 'error',
		message: 'found oops',
	});
});

test('language server status rows report state and diagnostics', async () => {
	const { path, lsp } = runLsp();
	await waitFor(() => lsp.clientFor(path)?.ready() === true);
	await waitFor(() => lsp.problems[path]?.length === 1);

	const typescript = lsp.statusRows().find((row) => row.id === 'typescript');

	expect(typescript).toMatchObject({
		command: `bun ${FAKE}`,
		state: 'ready',
		problems: 1,
	});
});

test('plugin language servers handle additional filetypes', async () => {
	const { dir, path } = project('a.kt');
	await createRoot((dispose) => {
		disposers.push(dispose);
		const warnings: string[] = [];
		const config = { ...DEFAULTS, lsp: true };
		const lsp = createAppLsp({
			rootDir: dir,
			config,
			say: (msg) => warnings.push(msg),
			servers: () => [{ id: 'kotlin', command: ['bun', FAKE], filetypes: ['kotlin'] }],
		});

		lsp.clientFor(path);

		return waitFor(() => lsp.clientFor(path)?.ready() === true).then(() => {
			const row = lsp.statusRows().find((entry) => entry.id === 'kotlin');
			expect(warnings).toEqual([]);
			expect(row).toMatchObject({
				command: `bun ${FAKE}`,
				state: 'ready',
			});
		});
	});
});

test('closing a tab clears diagnostics for that path', async () => {
	const { path, lsp, setTabs } = runLsp();
	await waitFor(() => lsp.problems[path]?.length === 1);

	setTabs([]);
	await waitFor(() => lsp.problems[path]?.length === 0);

	expect(lsp.problems[path]).toEqual([]);
});

test('completion flushes pending document edits before asking the server', async () => {
	const { path, lsp, setBuffers } = runLsp('const ok = 1\n');
	await waitFor(() => lsp.clientFor(path)?.ready() === true);

	setBuffers(path, 'content', 'const oops = 1\n');
	const reply = await lsp.complete(path, 0, 10);
	await waitFor(() => lsp.problems[path]?.length === 1);

	expect(reply?.items.map((item) => item.label)).toContain('duneAlpha');
	expect(lsp.problems[path]?.[0]?.message).toBe('found oops');
});

test('completion resolve asks servers for lazy edits', async () => {
	const { path, lsp } = runLsp('const ok = 1\n');
	await waitFor(() => lsp.clientFor(path)?.ready() === true);

	const resolved = await lsp.resolveCompletion(path, { label: 'duneLazy', kind: 7 });

	expect(resolved?.additionalTextEdits?.[0]?.newText).toContain('duneLazy');
});

test('restart clears clients and resyncs open documents', async () => {
	const { path, lsp } = runLsp();
	await waitFor(() => lsp.clientFor(path)?.ready() === true);
	const before = lsp.clientFor(path);

	expect(lsp.restart()).toBe(true);
	await waitFor(() => lsp.clientFor(path)?.ready() === true);
	await waitFor(() => lsp.problems[path]?.[0]?.message === 'found oops');

	expect(lsp.clientFor(path)).not.toBe(before);
	expect(lsp.problems[path]?.[0]?.message).toBe('found oops');
});

test('dependency changes restart active language servers after a quiet period', async () => {
	const { path, lsp, warnings } = runLsp();
	await waitFor(() => lsp.clientFor(path)?.ready() === true);
	const before = lsp.clientFor(path);

	lsp.dependenciesChanged();
	await waitFor(() => warnings.includes('Dependencies changed — restarted language servers'), 100);

	expect(lsp.clientFor(path)).not.toBe(before);
});

test('settings gate LSP clients and completion separately', async () => {
	const { dir, path } = project();
	createRoot((dispose) => {
		disposers.push(dispose);
		const config = { ...DEFAULTS, lsp: false, lspCompletion: false };
		const lsp = createAppLsp({ rootDir: dir, config, say: () => {} });
		expect(lsp.clientFor(path)).toBeNull();
		expect(lsp.complete(path, 0, 0)).resolves.toBeNull();
	});
});

test('missing default servers show install hints', async () => {
	const { dir, path } = project();
	await createRoot((dispose) => {
		disposers.push(dispose);
		const warnings: string[] = [];
		const config = { ...DEFAULTS, lsp: true };
		const lsp = createAppLsp({ rootDir: dir, config, say: (msg) => warnings.push(msg) });

		lsp.clientFor(path);

		return waitFor(() => warnings.length > 0).then(() => {
			expect(warnings[0]).toBe(
				'LSP: typescript-language-server not installed — npm i -g typescript-language-server typescript@5',
			);
		});
	});
});

test('missing npm servers can prompt for installation', async () => {
	const { dir, path } = project();
	await createRoot((dispose) => {
		disposers.push(dispose);
		const warnings: string[] = [];
		let prompt: Prompt = null;
		const config = { ...DEFAULTS, lsp: true };
		const lsp = createAppLsp({
			rootDir: dir,
			config,
			say: (msg) => warnings.push(msg),
			setPrompt: (next) => (prompt = next),
		});

		lsp.clientFor(path);

		return waitFor(() => prompt?.kind === 'installServer').then(() => {
			expect(warnings).toEqual([]);
			expect(prompt).toEqual({
				kind: 'installServer',
				id: 'typescript',
				name: 'typescript-language-server',
				install: { kind: 'npm', packages: ['typescript-language-server', 'typescript@5'] },
			});
		});
	});
});

test('auto-install can be disabled', async () => {
	const { dir, path } = project();
	await createRoot((dispose) => {
		disposers.push(dispose);
		const warnings: string[] = [];
		let prompt: Prompt = null;
		const config = { ...DEFAULTS, lsp: true, lspAutoInstall: false };
		const lsp = createAppLsp({
			rootDir: dir,
			config,
			say: (msg) => warnings.push(msg),
			setPrompt: (next) => (prompt = next),
		});

		lsp.clientFor(path);

		return waitFor(() => warnings.length > 0).then(() => {
			expect(prompt).toBeNull();
			expect(warnings[0]).toContain('npm i -g typescript-language-server typescript@5');
		});
	});
});

test('missing overridden servers do not show default install hints', async () => {
	const { dir, path } = project();
	await createRoot((dispose) => {
		disposers.push(dispose);
		const warnings: string[] = [];
		const config = {
			...DEFAULTS,
			lsp: true,
			lspServers: { typescript: ['dune-no-such-language-server'] },
		};
		const lsp = createAppLsp({ rootDir: dir, config, say: (msg) => warnings.push(msg) });

		lsp.clientFor(path);

		return waitFor(() => warnings.length > 0).then(() => {
			expect(warnings[0]).toBe(
				'LSP: dune-no-such-language-server is not installed, or not on PATH',
			);
		});
	});
});

test('typescript sdk setting is handed to the language server', async () => {
	const { dir, path } = project();
	const dump = join(dir, 'init.json');
	createRoot((dispose) => {
		disposers.push(dispose);
		const config = {
			...DEFAULTS,
			lsp: true,
			typescriptTsdk: '/opt/typescript/lib',
			lspServers: { typescript: ['bun', FAKE, dump] },
		};
		const lsp = createAppLsp({ rootDir: dir, config, say: () => {} });
		lsp.clientFor(path);
	});
	await waitFor(() => existsSync(dump));
	expect(JSON.parse(readFileSync(dump, 'utf8'))).toEqual({
		tsserver: { path: '/opt/typescript/lib' },
	});

	rmSync(dump);
	createRoot((dispose) => {
		disposers.push(dispose);
		const config = { ...DEFAULTS, lsp: true, lspServers: { typescript: ['bun', FAKE, dump] } };
		const lsp = createAppLsp({ rootDir: dir, config, say: () => {} });
		lsp.clientFor(path);
	});
	await waitFor(() => existsSync(dump));
	expect(JSON.parse(readFileSync(dump, 'utf8'))).toBeNull();
});

test('problem navigation wraps in both directions', () => {
	const first = { path: 'a.ts', line: 1, col: 2 } as Parameters<typeof problemFrom>[0][number];
	const second = { path: 'a.ts', line: 3, col: 1 } as Parameters<typeof problemFrom>[0][number];
	const list = [first, second];

	expect(problemFrom(list, 1, 2, 1)).toBe(second);
	expect(problemFrom(list, 9, 0, 1)).toBe(first);
	expect(problemFrom(list, 3, 1, -1)).toBe(first);
	expect(problemFrom(list, 0, 0, -1)).toBe(second);
});
