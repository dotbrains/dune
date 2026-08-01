import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fixture, launch, press, until } from './helpers';

async function openSave(dir: string) {
	const t = await launch(dir, {
		formatOnSave: true,
		formatters: { ts: [process.execPath, join(dir, 'upper.js')] },
	});
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	await press(t, (i) => i.pressKey('s', { ctrl: true }));
	return t;
}

test('format on save reloads the formatted file into the editor', async () => {
	const dir = fixture({
		'a.ts': 'const a = 1\n',
		'upper.js':
			"import { readFileSync, writeFileSync } from 'node:fs';\nconst file = process.argv.at(-1);\nwriteFileSync(file, readFileSync(file, 'utf8').toUpperCase());\n",
	});

	const t = await openSave(dir);
	await until(
		t,
		() =>
			readFileSync(join(dir, 'a.ts'), 'utf8') === 'CONST A = 1\n' &&
			t.captureCharFrame().includes('CONST A = 1'),
	);

	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('CONST A = 1\n');
	expect(t.captureCharFrame()).toContain('CONST A = 1');
	expect(t.captureCharFrame()).toContain('Formatted a.ts');
	expect(t.captureCharFrame()).not.toContain('unsaved');
});

test('failed format leaves the saved contents clean and reports the formatter error', async () => {
	const dir = fixture({
		'a.ts': 'const a = 1\n',
		'upper.js': "console.error('boom: bad syntax'); process.exit(2);\n",
	});
	const t = await launch(dir, {
		formatOnSave: true,
		formatters: { ts: [process.execPath, join(dir, 'upper.js')] },
	});
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	await press(t, (i) => void i.typeText('// edited\n'));
	await press(t, (i) => i.pressKey('s', { ctrl: true }));
	await until(t, () => t.captureCharFrame().includes('Format failed: boom: bad syntax'));

	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toContain('// edited');
	expect(t.captureCharFrame()).toContain('Format failed: boom: bad syntax');
	expect(t.captureCharFrame()).not.toContain('unsaved');
});

test('unmatched files still save without running a formatter', async () => {
	const dir = fixture({
		'a.md': 'hello\n',
		'upper.js':
			"import { writeFileSync } from 'node:fs';\nwriteFileSync(process.argv.at(-1), 'changed\\n');\n",
	});
	const t = await launch(dir, {
		formatOnSave: true,
		formatters: { ts: [process.execPath, join(dir, 'upper.js')] },
	});
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	await press(t, (i) => void i.typeText('!'));
	await press(t, (i) => i.pressKey('s', { ctrl: true }));
	await until(t, () => t.captureCharFrame().includes('Saved a.md'));

	expect(readFileSync(join(dir, 'a.md'), 'utf8')).toBe('!hello\n');
	expect(t.captureCharFrame()).toContain('Saved a.md');
});
