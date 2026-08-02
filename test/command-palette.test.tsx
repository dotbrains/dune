import { expect, test } from 'bun:test';
import { testRender } from '@opentui/solid';

import type { Command } from '../src/app/commands';
import { CommandPalette } from '../src/ui/CommandPalette';
import { press, pressEscape, settle } from './helpers';

test('command palette previews the selected row and cancels when dismissed', async () => {
	const events: string[] = [];
	const commands: Command[] = [
		{
			id: 'dark',
			label: 'Dark',
			preview: () => events.push('preview dark'),
			cancelPreview: () => events.push('cancel dark'),
			run: () => events.push('run dark'),
		},
		{
			id: 'light',
			label: 'Light',
			preview: () => events.push('preview light'),
			cancelPreview: () => events.push('cancel light'),
			run: () => events.push('run light'),
		},
		{ id: 'plain', label: 'Plain', run: () => events.push('run plain') },
	];

	const t = await testRender(() => (
		<CommandPalette commands={commands} onClose={() => events.push('close')} />
	));
	await settle(t);
	expect(events).toEqual(['preview dark']);

	await press(t, (input) => void input.typeText('light'));
	expect(events).toEqual(['preview dark', 'cancel dark', 'preview light']);

	await press(t, (input) => void input.typeText('zzzz'));
	expect(events).toEqual(['preview dark', 'cancel dark', 'preview light', 'cancel light']);

	await pressEscape(t);
	expect(events).toEqual(['preview dark', 'cancel dark', 'preview light', 'cancel light', 'close']);
});

test('command palette keeps a confirmed preview', async () => {
	const events: string[] = [];
	const commands: Command[] = [
		{
			id: 'dark',
			label: 'Dark',
			preview: () => events.push('preview dark'),
			cancelPreview: () => events.push('cancel dark'),
			run: () => events.push('run dark'),
		},
	];

	const t = await testRender(() => (
		<CommandPalette commands={commands} onClose={() => events.push('close')} />
	));
	await settle(t);
	await press(t, (input) => input.pressEnter());

	expect(events).toEqual(['preview dark', 'close', 'run dark']);
});
