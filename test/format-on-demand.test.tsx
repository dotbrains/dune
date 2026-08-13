import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fixture, launch, press, until } from './helpers';

const upperScript =
	"import { readFileSync, writeFileSync } from 'node:fs';\nconst file = process.argv.at(-1);\nwriteFileSync(file, readFileSync(file, 'utf8').toUpperCase());\n";

function runPalette(labelPart: string) {
	return async (t: Awaited<ReturnType<typeof launch>>) => {
		await press(t, (i) => i.pressKey('p', { ctrl: true }));
		await press(t, (i) => void i.typeText(labelPart));
		await press(t, (i) => i.pressEnter());
	};
}

test('Ctrl+Opt+L formats on demand even with formatOnSave off', async () => {
	const dir = fixture({ 'a.ts': 'const a = 1\n', 'upper.js': upperScript });
	const t = await launch(dir, {
		formatOnSave: false,
		formatters: { ts: [process.execPath, join(dir, 'upper.js')] },
	});
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	await press(t, (i) => void i.typeText('!'));
	await press(t, (i) => i.pressKey('l', { ctrl: true, meta: true }));
	await until(t, () => readFileSync(join(dir, 'a.ts'), 'utf8') === '!CONST A = 1\n', 100);

	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('!CONST A = 1\n');
	expect(t.captureCharFrame()).toContain('Formatted a.ts');
	expect(t.captureCharFrame()).not.toContain('unsaved');
});

test('Format document reports when no formatter matches', async () => {
	const t = await launch(fixture({ 'a.md': 'hello\n' }), { formatOnSave: false });
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	await runPalette('Format document')(t);
	expect(t.captureCharFrame()).toContain('No formatter configured for this file');
});

test('Save without formatting skips the configured formatter for one save', async () => {
	const dir = fixture({ 'a.ts': 'const a = 1\n', 'upper.js': upperScript });
	const t = await launch(dir, {
		formatOnSave: true,
		formatters: { ts: [process.execPath, join(dir, 'upper.js')] },
	});
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	await press(t, (i) => void i.typeText('!'));
	await runPalette('Save without formatting')(t);
	await until(t, () => t.captureCharFrame().includes('Saved a.ts'), 100);

	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('!const a = 1\n');
	expect(t.captureCharFrame()).not.toContain('Formatted');
});

test('Format open files formats every dirty tab with a matching formatter', async () => {
	const dir = fixture({ 'a.ts': 'const a = 1\n', 'b.ts': 'const b = 2\n', 'upper.js': upperScript });
	const t = await launch(dir, {
		formatOnSave: false,
		formatters: { ts: [process.execPath, join(dir, 'upper.js')] },
	});
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	await press(t, (i) => void i.typeText('!'));

	await press(t, (i) => i.pressKey('o', { ctrl: true }));
	await press(t, (i) => void i.typeText('b.ts'));
	await press(t, (i) => i.pressEnter());
	await press(t, (i) => void i.typeText('!'));

	await runPalette('Format open files')(t);
	await until(
		t,
		() =>
			readFileSync(join(dir, 'a.ts'), 'utf8') === '!CONST A = 1\n' &&
			readFileSync(join(dir, 'b.ts'), 'utf8') === '!CONST B = 2\n',
		150,
	);

	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('!CONST A = 1\n');
	expect(readFileSync(join(dir, 'b.ts'), 'utf8')).toBe('!CONST B = 2\n');
	expect(t.captureCharFrame()).toContain('Formatted 2 files');
});
