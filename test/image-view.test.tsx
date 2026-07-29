import { describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { encode } from 'fast-png';

import { fixture, launch, press, settle } from './helpers';

function imageProject(): { dir: string; png: string } {
	const dir = fixture({ 'main.ts': 'const answer = 42\n' });
	const png = join(dir, 'logo.png');
	const pixels = Array.from({ length: 4 * 8 }, (_, index) =>
		index % 2 === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255],
	).flat();
	writeFileSync(png, encode({ width: 4, height: 8, data: new Uint8Array(pixels), channels: 4 }));
	return { dir, png };
}

describe('image viewer', () => {
	test('single-file mode opens an image viewer', async () => {
		const { dir, png } = imageProject();
		const frame = (
			await launch(dir, {}, { width: 80, height: 24 }, { openFile: png })
		).captureCharFrame();

		expect(frame).toContain('logo.png - 4x8 - 1 KB');
		expect(frame).toContain('▀');
		expect(frame).not.toContain('binary');
	});

	test('the file picker opens image tabs without creating editable buffers', async () => {
		const { dir, png } = imageProject();
		const t = await launch(dir, {}, { width: 80, height: 24 });

		await press(t, (input) => input.pressKey('o', { ctrl: true }));
		await press(t, (input) => void input.typeText('logo'));
		await press(t, (input) => input.pressEnter());
		await settle(t);

		const open = t.captureCharFrame();
		expect(open).toContain('logo.png - 4x8 - 1 KB');
		expect(open).toContain('image');
		expect(open).not.toContain('cannot be shown');

		const before = [...(await Bun.file(png).bytes())];
		await press(t, (input) => input.pressKey('s', { ctrl: true }));
		expect([...(await Bun.file(png).bytes())]).toEqual(before);
		expect(t.captureCharFrame()).not.toContain('Saved logo.png');

		await press(t, (input) => input.pressKey('w', { ctrl: true }));
		expect(t.captureCharFrame()).not.toContain('logo.png - 4x8');
	});

	test('image tabs survive session restore', async () => {
		const { dir } = imageProject();
		const first = await launch(dir, {}, { width: 80, height: 24 });

		await press(first, (input) => input.pressKey('o', { ctrl: true }));
		await press(first, (input) => void input.typeText('logo'));
		await press(first, (input) => input.pressEnter());
		await settle(first);
		expect(first.captureCharFrame()).toContain('logo.png - 4x8');

		const second = await launch(dir, {}, { width: 80, height: 24 });
		expect(second.captureCharFrame()).toContain('logo.png - 4x8 - 1 KB');
	});
});
