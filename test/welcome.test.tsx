import { describe, expect, test } from 'bun:test';

import { welcomeKeys } from '../src/ui/keys';
import { fixture, launch, press } from './helpers';

describe('empty editor prompt', () => {
	test('advertises shortcuts from the key table', async () => {
		const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
		const frame = t.captureCharFrame();

		expect(frame).toContain('dune');
		for (const [key, label] of welcomeKeys().slice(0, 3)) {
			expect(frame).toContain(key);
			expect(frame).toContain(label);
		}
	});

	test('trims the shortcut list on a short terminal', async () => {
		const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {}, { height: 10 });
		const frame = t.captureCharFrame();

		expect(frame).toContain('dune');
		expect(frame).not.toContain(welcomeKeys().at(-1)![1]);
	});

	test('goes away once a file is open', async () => {
		const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
		await press(t, (input) => input.pressArrow('down'));
		await press(t, (input) => input.pressEnter());

		const frame = t.captureCharFrame();
		expect(frame).toContain('const a = 1');
		expect(frame).not.toContain(welcomeKeys()[0]![1]);
	});
});
