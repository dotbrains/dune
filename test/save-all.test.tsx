import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { fixture, launch, openFile, press, runCommand, until } from './helpers';
import type { Harness } from './helpers';

const PROJECT = {
	'a.ts': 'const a = 1\n',
	'b.ts': 'const b = 2\n',
	'c.ts': 'const c = 3\n',
};

async function dirty(t: Harness, name: string) {
	await openFile(t, name);
	await press(t, (input) => void input.typeText('x'));
}

test('save all writes every dirty tab and counts them', async () => {
	const dir = fixture(PROJECT);
	const t = await launch(dir, { autoSaveOnBlur: false });
	await dirty(t, 'a.ts');
	await dirty(t, 'b.ts');
	await openFile(t, 'c.ts');

	await runCommand(t, 'Save all');

	await until(t, () => t.captureCharFrame().includes('Saved 2 files'));
	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('xconst a = 1\n');
	expect(readFileSync(join(dir, 'b.ts'), 'utf8')).toBe('xconst b = 2\n');
	expect(readFileSync(join(dir, 'c.ts'), 'utf8')).toBe('const c = 3\n');
});

test('save all says when no tabs are dirty', async () => {
	const dir = fixture(PROJECT);
	const t = await launch(dir, { autoSaveOnBlur: false });
	await openFile(t, 'a.ts');

	await runCommand(t, 'Save all');

	await until(t, () => t.captureCharFrame().includes('Nothing to save'));
	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('const a = 1\n');
});

test('save all skips a dirty tab changed on disk', async () => {
	const dir = fixture(PROJECT);
	const t = await launch(dir, { autoSaveOnBlur: false });
	await dirty(t, 'a.ts');
	writeFileSync(join(dir, 'a.ts'), 'someone else wrote this\n');

	await runCommand(t, 'Save all');

	await until(t, () => t.captureCharFrame().includes('Changed on disk with unsaved edits: a.ts'));
	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('someone else wrote this\n');
});
