import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { planProjectReplace, replaceAll, replaceMatch, replaceProject } from '../src/core/search';
import { fixture, launch, press, pressEscape, runCommand, settle, until } from './helpers';

test('replaceAll swaps every occurrence, ignoring case', () => {
	expect(replaceAll('a Foo b foo c', 'foo', 'bar')).toBe('a bar b bar c');
	expect(replaceAll('nothing here', 'foo', 'bar')).toBe('nothing here');
	expect(replaceAll('abc', '', 'x')).toBe('abc');
});

test('the query is matched literally, not as a regex', () => {
	expect(replaceAll('a.b axb', 'a.b', 'Z')).toBe('Z axb');
	expect(replaceAll('cost $5', '$5', 'free')).toBe('cost free');
});

test('the replacement is inserted literally', () => {
	expect(replaceAll('foo', 'foo', '$&$1')).toBe('$&$1');
});

test('an anchored regex replaces every line it was counted on', () => {
	const dir = fixture({ 'a.ts': 'const a = 1\nconst b = 2\nconst c = 3\n' });
	const path = join(dir, 'a.ts');
	expect(planProjectReplace(dir, '^const', { regex: true }).matches).toBe(3);

	const result = replaceProject([path], '^const', 'let', { regex: true });
	expect(result.matches).toBe(3);
	expect(readFileSync(path, 'utf8')).toBe('let a = 1\nlet b = 2\nlet c = 3\n');
});

test('project replace keeps CRLF and BOM spelling', () => {
	const dir = fixture({});
	const crlf = join(dir, 'crlf.ts');
	const bom = join(dir, 'bom.ts');
	writeFileSync(crlf, 'one OLD\r\ntwo\r\n');
	writeFileSync(bom, '\uFEFFOLD here\n');

	const result = replaceProject([crlf, bom], 'OLD', 'NEW');
	expect(result.matches).toBe(2);
	expect(readFileSync(crlf, 'utf8')).toBe('one NEW\r\ntwo\r\n');
	expect(readFileSync(bom, 'utf8')).toBe('\uFEFFNEW here\n');
});

test('project replace plans from open buffers instead of disk', () => {
	const dir = fixture({ 'a.ts': 'OLD OLD\n' });
	const path = join(dir, 'a.ts');
	const buffers = new Map([[path, 'OLD once, edited away the other\n']]);
	expect(planProjectReplace(dir, 'OLD', {}, buffers).matches).toBe(1);
});

test('a character that changes length when lowercased does not shift the match', () => {
	// U+0130 lowercases to two code units, so offsets from a lowercased copy drift.
	expect(replaceAll('İstanbul FOO', 'foo', 'BAR')).toBe('İstanbul BAR');
});

test('replaceMatch touches the one occurrence it is given', () => {
	const text = 'old one\nold two\n';
	const match = { path: 'a.ts', line: 1, col: 0, length: 3, text: 'old two' };
	expect(replaceMatch(text, match, 'new')).toBe('old one\nnew two\n');
});

test('replaceMatch refuses a match whose line has moved on', () => {
	const stale = { path: 'a.ts', line: 0, col: 0, length: 3, text: 'old one' };
	expect(replaceMatch('edited since\n', stale, 'new')).toBeNull();
});

/** Open the fixture's only file, then find `query` with the replacement typed in. */
async function openReplace(dir: string, query: string, replacement: string) {
	const t = await launch(dir);
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());

	await press(t, (i) => i.pressKey('f', { ctrl: true }));
	await press(t, (i) => void i.typeText(query));
	await press(t, (i) => i.pressTab()); // switch to the replacement field
	await press(t, (i) => void i.typeText(replacement));
	return t;
}

test('the replacement is shown against each hit as it is typed', async () => {
	const dir = fixture({ 'a.ts': 'const old = 1\nconst old2 = old + 1\n' });
	const t = await openReplace(dir, 'old', 'fresh');
	await settle(t);

	// Every row reads as the line will read: the hit, struck through, then what
	// replaces it. Colour and strikethrough are not in a char frame; the text is.
	const frame = t.captureCharFrame();
	expect(frame).toContain('const oldfresh = 1');
	expect(frame).toContain('const oldfresh2 = old + 1');
	// Nothing is written until Enter — the file on disk is untouched.
	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('const old = 1\nconst old2 = old + 1\n');
});

test('with the replacement empty the rows read as the file does', async () => {
	const dir = fixture({ 'a.ts': 'const old = 1\n' });
	const t = await openReplace(dir, 'old', '');
	await settle(t);
	expect(t.captureCharFrame()).toContain('const old = 1');
});

test('Ctrl+A replaces every match in the open file', async () => {
	const dir = fixture({ 'a.ts': 'const old = 1\nconst old2 = old + 1\n' });
	const t = await openReplace(dir, 'old', 'fresh');

	await press(t, (i) => i.pressKey('a', { ctrl: true }));
	await press(t, (i) => i.pressKey('s', { ctrl: true }));

	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe(
		'const fresh = 1\nconst fresh2 = fresh + 1\n',
	);
});

test('Enter replaces only the selected match, leaving the rest', async () => {
	const dir = fixture({ 'a.ts': 'const old = 1\nconst old2 = old + 1\n' });
	const t = await openReplace(dir, 'old', 'fresh');

	await press(t, (i) => i.pressEnter());
	// The panel stays open after a single replace, and it owns the keyboard.
	await pressEscape(t);
	await press(t, (i) => i.pressKey('s', { ctrl: true }));

	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('const fresh = 1\nconst old2 = old + 1\n');
});

test('the panel stays open, so the next match can go too', async () => {
	const dir = fixture({ 'a.ts': 'const old = 1\nconst old2 = old + 1\n' });
	const t = await openReplace(dir, 'old', 'fresh');

	await press(t, (i) => i.pressEnter());
	await press(t, (i) => i.pressEnter());
	await pressEscape(t);
	await press(t, (i) => i.pressKey('s', { ctrl: true }));

	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('const fresh = 1\nconst fresh2 = old + 1\n');
});

test('a replacement is undoable — it must not wipe the history', async () => {
	const dir = fixture({ 'a.ts': 'const old = 1\n' });
	const t = await openReplace(dir, 'old', 'fresh');

	await press(t, (i) => i.pressEnter());
	await pressEscape(t);
	await press(t, (i) => i.pressKey('z', { ctrl: true }));
	await press(t, (i) => i.pressKey('s', { ctrl: true }));

	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('const old = 1\n');
});

async function openProjectReplace(dir: string, query: string, replacement: string) {
	const t = await launch(dir, { autoSaveOnBlur: false }, { width: 100, height: 30 });
	await runCommand(t, 'Replace in project');
	await press(t, (i) => void i.typeText(query));
	await press(t, (i) => i.pressTab());
	await press(t, (i) => void i.typeText(replacement));
	await settle(t, 300);
	return t;
}

test('the palette opens project replace with previews', async () => {
	const t = await openProjectReplace(
		fixture({ 'a.ts': 'const OLD = 1\n', 'b.ts': 'let OLD = 2\n' }),
		'OLD',
		'NEW',
	);
	const frame = t.captureCharFrame();
	expect(frame).toContain('Search in project');
	expect(frame).toContain('NEW');
	expect(frame).toContain('const OLDNEW = 1');
});

test('project replace-all confirms and writes closed files', async () => {
	const dir = fixture({ 'a.ts': 'const OLD = 1\n', 'b.ts': 'let OLD = 2\n' });
	const t = await openProjectReplace(dir, 'OLD', 'NEW');

	await press(t, (i) => i.pressKey('a', { ctrl: true }));
	await until(t, () => t.captureCharFrame().includes('Replace 2 matches in 2 files'));
	await press(t, (i) => i.pressEnter());
	await until(t, () => t.captureCharFrame().includes('Replaced 2 matches in 2 files'));

	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('const NEW = 1\n');
	expect(readFileSync(join(dir, 'b.ts'), 'utf8')).toBe('let NEW = 2\n');
});
