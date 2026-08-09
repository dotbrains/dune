import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fixture, launch, press, runCommand } from './helpers';

const OPEN_UNDER_CURSOR = '\u001B\u000F';

const PROJECT = {
	'src/deeply/nested/target.ts': 'const found = 1\n',
	'src/other.ts': 'const other = 2\n',
	'notes.md': 'one\ntwo\nthree\nfour\nfive\n',
};

test('the file picker opens a file by fuzzy path', async () => {
	const t = await launch(fixture(PROJECT));
	await press(t, (i) => i.pressKey('o', { ctrl: true }));
	expect(t.captureCharFrame()).toContain('Open file');

	await press(t, (i) => void i.typeText('target'));
	await press(t, (i) => i.pressEnter());

	const frame = t.captureCharFrame();
	expect(frame).toContain('const found = 1');
	expect(frame).toContain('target.ts');
});

test('the picker treats a trailing :line:col as a destination', async () => {
	const dir = fixture(PROJECT);
	const t = await launch(dir);
	await press(t, (i) => i.pressKey('o', { ctrl: true }));
	await press(t, (i) => void i.typeText('notes:4:3'));
	// The suffix is a destination, not part of the path: notes.md still matches
	// and the footer echoes where Enter will land.
	expect(t.captureCharFrame()).toContain('at 4:3');
	await press(t, (i) => i.pressEnter());
	await press(t, (i) => void i.typeText('X'));
	await press(t, (i) => i.pressKey('s', { ctrl: true }));

	expect(readFileSync(join(dir, 'notes.md'), 'utf8')).toBe('one\ntwo\nthree\nfoXur\nfive\n');
});

test('go to line moves the cursor there', async () => {
	const dir = fixture(PROJECT);
	const t = await launch(dir);
	await press(t, (i) => i.pressKey('o', { ctrl: true }));
	await press(t, (i) => void i.typeText('notes'));
	await press(t, (i) => i.pressEnter());

	await press(t, (i) => i.pressKey('g', { ctrl: true }));
	await press(t, (i) => void i.typeText('4'));
	await press(t, (i) => i.pressEnter());
	await press(t, (i) => void i.typeText('X'));
	await press(t, (i) => i.pressKey('s', { ctrl: true }));

	expect(readFileSync(join(dir, 'notes.md'), 'utf8')).toBe('one\ntwo\nthree\nXfour\nfive\n');
});

test('open file under cursor follows import paths', async () => {
	const dir = fixture({
		'src/main.ts': "import target from './target'\nconsole.log(target)\n",
		'src/target.ts': 'export default 1\n',
	});
	const t = await launch(dir, {}, {}, { openFile: join(dir, 'src/main.ts') });

	await press(t, (i) => {
		for (let n = 0; n < 22; n++) i.pressArrow('right');
	});
	await press(t, (i) => void i.pressKeys([OPEN_UNDER_CURSOR]));

	expect(t.captureCharFrame()).toContain('export default 1');
	expect(t.captureCharFrame()).toContain('target.ts');
});

test('open file under cursor follows tsconfig aliases', async () => {
	const dir = fixture({
		'src/main.ts': "import target from '@/target'\nconsole.log(target)\n",
		'src/target.ts': 'export default 1\n',
		'tsconfig.json': '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}',
	});
	const t = await launch(dir, {}, {}, { openFile: join(dir, 'src/main.ts') });

	await press(t, (i) => {
		for (let n = 0; n < 22; n++) i.pressArrow('right');
	});
	await runCommand(t, 'Open file under cursor');

	expect(t.captureCharFrame()).toContain('export default 1');
	expect(t.captureCharFrame()).toContain('target.ts');
});

test('open file under cursor follows tsconfig baseUrl', async () => {
	const dir = fixture({
		'src/main.ts': "import target from 'shared/target'\nconsole.log(target)\n",
		'src/shared/target.ts': 'export default 1\n',
		'tsconfig.json': '{"compilerOptions":{"baseUrl":"src"}}',
	});
	const t = await launch(dir, {}, {}, { openFile: join(dir, 'src/main.ts') });

	await press(t, (i) => {
		for (let n = 0; n < 26; n++) i.pressArrow('right');
	});
	await runCommand(t, 'Open file under cursor');

	expect(t.captureCharFrame()).toContain('export default 1');
	expect(t.captureCharFrame()).toContain('target.ts');
});
