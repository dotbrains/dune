import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { fixture, launch, press, runCommand, settle, until } from './helpers';

const FAKE = join(import.meta.dir, 'fixtures', 'fake-lsp.ts');
const lspConfig = { lsp: true, lspServers: { typescript: [process.execPath, FAKE] } };

const frame = (t: Awaited<ReturnType<typeof launch>>) => t.captureCharFrame();

describe('LSP diagnostics in the UI', () => {
	test('diagnostics reach the status bar, problem list, and next-problem command', async () => {
		const dir = fixture({ 'a.ts': 'const ok = 1\nconst bad = oops\n' });
		const t = await launch(dir, lspConfig, {}, { openFile: join(dir, 'a.ts') });

		await until(t, () => frame(t).includes('● 1'));
		expect(frame(t)).toContain('● 1');

		await runCommand(t, 'List problems');
		expect(frame(t)).toContain('Problems');
		expect(frame(t)).toContain('a.ts:2:13 error: found oops');

		await press(t, (input) => input.pressEnter());
		expect(frame(t)).toContain('Ln 2, Col 13');

		await runCommand(t, 'Next problem');
		expect(frame(t)).toContain('found oops');
	});

	test('a problem far below the viewport is marked on the track', async () => {
		const content = `${Array.from({ length: 60 }, (_, i) => `const line${i} = ${i}`).join('\n')}\nconst bad = oops\n`;
		const dir = fixture({ 'a.ts': content });
		const t = await launch(dir, lspConfig, { height: 12 }, { openFile: join(dir, 'a.ts') });

		await until(t, () => frame(t).includes('● 1'));
		await settle(t);

		const track = frame(t)
			.split('\n')
			.slice(1, -1)
			.map((line) => line.at(-2) ?? '')
			.join('');
		expect(track).toContain('●');
	});
});
