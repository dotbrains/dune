import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { fixture, launch, press, runCommand, until } from './helpers';

const FAKE = join(import.meta.dir, 'fixtures', 'fake-lsp.ts');
const lspConfig = { lsp: true, lspServers: { typescript: [process.execPath, FAKE] } };

const frame = (t: Awaited<ReturnType<typeof launch>>) => t.captureCharFrame();

describe('LSP completions in the editor', () => {
	test('shows and accepts completions from the command palette', async () => {
		const dir = fixture({ 'a.ts': '' });
		const t = await launch(dir, lspConfig, {}, { openFile: join(dir, 'a.ts') });

		await press(t, (input) => void input.typeText('dune'));
		await runCommand(t, 'Show completions');
		await until(t, () => frame(t).includes('duneAlpha'));

		expect(frame(t)).toContain('duneAlpha');
		await press(t, (input) => input.pressEnter());
		expect(frame(t)).toContain('duneAlpha()');
	});

	test('resolves a completion before applying it', async () => {
		const dir = fixture({ 'a.ts': '' });
		const t = await launch(dir, lspConfig, {}, { openFile: join(dir, 'a.ts') });

		await press(t, (input) => void input.typeText('duneL'));
		await runCommand(t, 'Show completions');
		await until(t, () => frame(t).includes('duneLazy'));

		await press(t, (input) => input.pressEnter());
		expect(frame(t)).toContain('import { duneLazy } from "dune"');
		expect(frame(t)).toContain('duneLazy');
	});
});
