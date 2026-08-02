import { describe, expect, test } from 'bun:test';

import { fixture, launch, press, runCommand, settle, until } from './helpers';

const files = { 'a.ts': 'const a = 1\n', 'src/deep/b.ts': 'const b = 2\n' };

describe('collapsing the file tree', () => {
	test('the palette folds every sidebar folder and keeps the cursor visible', async () => {
		const t = await launch(fixture(files));
		await press(t, (input) => input.pressArrow('down'));
		await press(t, (input) => input.pressArrow('right'));
		await press(t, (input) => input.pressArrow('down'));
		await press(t, (input) => input.pressArrow('right'));
		await until(t, () => t.captureCharFrame().includes('b.ts'));

		await runCommand(t, 'Collapse folders in sidebar');
		await settle(t);

		expect(t.captureCharFrame()).not.toContain('b.ts');
		expect(t.captureCharFrame()).not.toContain('deep');
		await press(t, (input) => input.pressArrow('right'));
		expect(t.captureCharFrame()).toContain('deep');
	});
});
