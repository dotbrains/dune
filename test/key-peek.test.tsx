import { expect, test } from 'bun:test';

import { fixture, launch, press } from './helpers';

const PROJECT = { 'a.ts': 'const a = 1\n' };

async function inTree() {
	return launch(fixture(PROJECT), {}, { width: 120, height: 30 });
}

async function inEditor() {
	const t = await inTree();
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	return t;
}

const peek = (t: Awaited<ReturnType<typeof inTree>>) =>
	press(t, (i) => i.pressKey('k', { ctrl: true }));

test('Ctrl+K in the tree shows the tree keys', async () => {
	const t = await inTree();
	await peek(t);

	const frame = t.captureCharFrame();
	expect(frame).toContain('Select a rang');
	expect(frame).toContain('Reopen closed');
	// Editor-only keys stay out of the tree's peek.
	expect(frame).not.toContain('Toggle commen');
});

test('Ctrl+K in the editor shows the editor keys instead', async () => {
	const t = await inEditor();
	await peek(t);

	const frame = t.captureCharFrame();
	expect(frame).toContain('Toggle commen');
	expect(frame).not.toContain('Select a rang');
});

test('the next key folds the peek and still does its job', async () => {
	const t = await inTree();
	await press(t, (i) => i.pressArrow('down'));
	await peek(t);
	expect(t.captureCharFrame()).toContain('Select a rang');

	await press(t, (i) => void i.typeText('r'));
	const frame = t.captureCharFrame();
	expect(frame).not.toContain('Select a rang');
	// The dismissing key was not swallowed: the rename prompt is open.
	expect(frame).toContain('Rename to');
});

test('Ctrl+K again closes it without doing anything else', async () => {
	const t = await inTree();
	await peek(t);
	await peek(t);
	expect(t.captureCharFrame()).not.toContain('Select a rang');
});

test('typing in the editor after a peek lands in the buffer', async () => {
	const t = await inEditor();
	await peek(t);
	await press(t, (i) => void i.typeText('X'));

	const frame = t.captureCharFrame();
	expect(frame).not.toContain('Toggle commen');
	expect(frame).toContain('Xconst a = 1');
});
