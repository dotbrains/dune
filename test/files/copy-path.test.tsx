import { describe, expect, test } from 'bun:test';

import { fixture, launch, press, runCommand } from '../helpers';

describe('copying a file path', () => {
	test('copies the tree selection as a relative path', async () => {
		const dir = fixture({ 'a.ts': 'const a = 1\n', 'b.ts': 'const b = 2\n' });
		const t = await launch(dir);
		await press(t, (input) => input.pressArrow('down'));

		await runCommand(t, 'Copy relative path');

		const frame = t.captureCharFrame();
		expect(frame).toContain('Copied a.ts');
		expect(frame).not.toContain('press p');
	});

	test('copies the open file as a relative path from the editor', async () => {
		const dir = fixture({ 'src/deep/a.ts': 'const a = 1\n' });
		const t = await launch(dir, {}, {}, { openFile: `${dir}/src/deep/a.ts` });

		await runCommand(t, 'Copy relative path');

		expect(t.captureCharFrame()).toContain('Copied src/deep/a.ts');
	});

	test('copies the absolute path', async () => {
		const dir = fixture({ 'a.ts': 'const a = 1\n' });
		const t = await launch(dir, {}, { width: 200 });
		await press(t, (input) => input.pressArrow('down'));

		await runCommand(t, 'Copy path');

		expect(t.captureCharFrame()).toContain(`Copied ${dir}/a.ts`);
	});

	test('the default chord copies rather than quitting', async () => {
		const dir = fixture({ 'a.ts': 'const a = 1\n' });
		const t = await launch(dir, {}, { width: 200 });
		await press(t, (input) => input.pressArrow('down'));

		await press(t, (input) => input.pressKey('c', { ctrl: true, meta: true }));
		expect(t.captureCharFrame()).toContain(`Copied ${dir}/a.ts`);
	});

	test('falls back to the absolute path for files outside the project', async () => {
		const outside = fixture({ 'far.ts': 'export const far = 1\n' });
		const t = await launch(
			fixture({ 'a.ts': 'const a = 1\n' }),
			{},
			{ width: 200 },
			{ openFile: `${outside}/far.ts` },
		);

		await runCommand(t, 'Copy relative path');

		const frame = t.captureCharFrame();
		expect(frame).toContain(`Copied ${outside}/far.ts`);
		expect(frame).toContain('outside the project');
	});

	test('keeps a dotted filename inside the project relative', async () => {
		const dir = fixture({ '..rc': 'x = 1\n' });
		const t = await launch(dir, {}, { width: 200 });
		await press(t, (input) => input.pressArrow('down'));

		await runCommand(t, 'Copy relative path');

		const frame = t.captureCharFrame();
		expect(frame).toContain('Copied ..rc');
		expect(frame).not.toContain('outside the project');
	});

	test('warns when no file is selected or open', async () => {
		const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));

		await runCommand(t, 'Copy path');

		expect(t.captureCharFrame()).toContain('No file to copy the path of');
	});
});
