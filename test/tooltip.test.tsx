import { expect, test } from 'bun:test';

import { TOOLTIP_DWELL_MS } from '../src/ui/tooltip';
import { fixture, launch, openFile, settle } from './helpers';

const closeColumn = (t: Awaited<ReturnType<typeof launch>>) => {
	const bar = t.captureCharFrame().split('\n')[0]!;
	return bar.indexOf('×');
};

const rest = async (t: Awaited<ReturnType<typeof launch>>, x: number, y: number) => {
	await t.mockMouse.moveTo(x, y);
	await settle(t, TOOLTIP_DWELL_MS + 50);
};

test('nothing shows before the pointer has rested the dwell out', async () => {
	const t = await launch(fixture({ 'a.ts': 'x\n' }));
	await openFile(t, 'a.ts');
	const x = closeColumn(t);

	await t.mockMouse.moveTo(x, 0);
	await settle(t, TOOLTIP_DWELL_MS / 2);
	expect(t.captureCharFrame()).not.toContain('Close tab');
});

test('resting on the close icon shows its shortcut', async () => {
	const t = await launch(fixture({ 'a.ts': 'x\n' }));
	await openFile(t, 'a.ts');
	await rest(t, closeColumn(t), 0);
	expect(t.captureCharFrame()).toContain('Close tab (Ctrl+W)');
});

test('a pointer only passing through says nothing at all', async () => {
	const t = await launch(fixture({ 'a.ts': 'x\n' }));
	await openFile(t, 'a.ts');
	const x = closeColumn(t);

	await t.mockMouse.moveTo(x, 0);
	await settle(t, TOOLTIP_DWELL_MS / 4);
	await t.mockMouse.moveTo(x + 3, 0);
	await settle(t, TOOLTIP_DWELL_MS);
	expect(t.captureCharFrame()).not.toContain('Close tab');
});

test('leaving hides it, and a custom shortcut is what shows', async () => {
	const t = await launch(fixture({ 'a.ts': 'x\n' }), { keybindings: { 'tabs.close': 'Ctrl+Alt+W' } });
	await openFile(t, 'a.ts');
	const x = closeColumn(t);
	await rest(t, x, 0);
	expect(t.captureCharFrame()).toContain('Close tab (Ctrl+Alt+W)');

	await t.mockMouse.moveTo(x + 20, 0);
	await settle(t);
	expect(t.captureCharFrame()).not.toContain('Close tab');
});

test('the tooltips setting turns the whole thing off', async () => {
	const t = await launch(fixture({ 'a.ts': 'x\n' }), { tooltips: false });
	await openFile(t, 'a.ts');
	await rest(t, closeColumn(t), 0);
	expect(t.captureCharFrame()).not.toContain('Close tab');
});
