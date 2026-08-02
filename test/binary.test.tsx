import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encode } from 'fast-png';

import { decodeImage, imageCells, isImagePath } from '../src/core/image';
import type { RawImage } from '../src/core/image';
import { isPdfPath, openPdf, pdfRenderSize, stepPdfZoom } from '../src/core/pdf';
import { fixture, launch, press, settle, until } from './helpers';

/** A project with a real binary file next to a text one. */
function project() {
	const dir = mkdtempSync(join(tmpdir(), 'dune-'));
	writeFileSync(join(dir, '.DS_Store'), Buffer.from([0, 1, 2, 0, 3, 4]));
	writeFileSync(join(dir, 'main.ts'), 'const a = 1\n');
	return dir;
}

function pngFixture(width: number, height: number, pixels: number[]): string {
	const dir = mkdtempSync(join(tmpdir(), 'dune-image-'));
	const path = join(dir, 'image.png');
	writeFileSync(path, encode({ width, height, data: new Uint8Array(pixels), channels: 4 }));
	return path;
}

const rawImage = (width: number, height: number, pixels: number[]): RawImage => ({
	width,
	height,
	pixels: new Uint8Array(pixels),
	bytes: pixels.length,
});

function imageProject(): { dir: string; png: string } {
	const dir = fixture({ 'main.ts': 'const answer = 42\n' });
	const png = join(dir, 'logo.png');
	const pixels = Array.from({ length: 4 * 8 }, (_, index) =>
		index % 2 === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255],
	).flat();
	writeFileSync(png, encode({ width: 4, height: 8, data: new Uint8Array(pixels), channels: 4 }));
	return { dir, png };
}

function pdfBytes(): Uint8Array {
	const encoder = new TextEncoder();
	const stream = (content: string) =>
		`<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}\nendstream`;
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 20 20] /Resources << >> /Contents 4 0 R >>',
		stream('1 0 0 rg\n0 0 20 20 re f'),
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 20 20] /Resources << >> /Contents 6 0 R >>',
		stream('0 0 1 rg\n0 0 20 20 re f'),
	];
	let body = '%PDF-1.4\n';
	const offsets: number[] = [];
	for (const [index, object] of objects.entries()) {
		offsets.push(encoder.encode(body).byteLength);
		body += `${index + 1} 0 obj\n${object}\nendobj\n`;
	}
	const xref = encoder.encode(body).byteLength;
	const rows = offsets.map((offset) => `${offset.toString().padStart(10, '0')} 00000 n `);
	body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${rows.join('\n')}\n`;
	body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return encoder.encode(body);
}

function pdfProject(): { dir: string; pdf: string } {
	const dir = fixture({ 'main.ts': 'const answer = 42\n' });
	const pdf = join(dir, 'sample.pdf');
	writeFileSync(pdf, pdfBytes());
	return { dir, pdf };
}

test('a binary file is listed but does not open', async () => {
	const t = await launch(project());
	expect(t.captureCharFrame()).toContain('.DS_Store');

	await press(t, (i) => i.pressArrow('down')); // .DS_Store sorts first
	await press(t, (i) => i.pressEnter());
	await settle(t);

	const frame = t.captureCharFrame();
	// Over the pane, where the file would have appeared — not a footnote in the bar.
	expect(frame).toContain('.DS_Store cannot be shown');
	expect(frame).toContain('binary');
	// Still no tab and no buffer: the refusal is drawn, not opened.
	expect(frame.split('\n')[0]).not.toContain('.DS_Store');
});

test('the refusal covers the file that was open, and leaves when a key is pressed', async () => {
	const t = await launch(project());
	await press(t, (i) => i.pressKey('o', { ctrl: true }));
	await press(t, (i) => void i.typeText('main.ts'));
	await press(t, (i) => i.pressEnter());
	await settle(t);
	expect(t.captureCharFrame()).toContain('const a = 1');

	await press(t, (i) => i.pressKey('o', { ctrl: true }));
	await press(t, (i) => void i.typeText('.DS_Store'));
	await press(t, (i) => i.pressEnter());
	await settle(t);

	// The point of drawing it here: the open file is not still sitting there looking
	// like the thing that was asked for.
	expect(t.captureCharFrame()).not.toContain('const a = 1');
	expect(t.captureCharFrame()).toContain('cannot be shown');

	await press(t, (i) => i.pressArrow('down'));
	await settle(t);
	expect(t.captureCharFrame()).toContain('const a = 1');
	expect(t.captureCharFrame()).not.toContain('cannot be shown');
});

test('it can never be written back to disk, because it is never a buffer', async () => {
	const dir = project();
	const before = readFileSync(join(dir, '.DS_Store'));
	const t = await launch(dir);
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	// Typing goes nowhere in particular: there is nothing open to type into.
	await press(t, (i) => void i.typeText('xxx'));
	await press(t, (i) => i.pressKey('s', { ctrl: true }));
	await settle(t);

	expect(readFileSync(join(dir, '.DS_Store'))).toEqual(before);
});

test('text files still open normally afterwards', async () => {
	const t = await launch(project());
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	await settle(t);

	const frame = t.captureCharFrame();
	// The refusal went away with the next key, so the file is visible again.
	expect(frame).toContain('const a = 1');
	expect(frame).not.toContain('cannot be shown');
	expect(frame.split('\n')[0]).toContain('main.ts');
	expect(frame.split('\n')[0]).not.toContain('.DS_Store');
});

test('image helpers decode still images and pack terminal cells', () => {
	expect(isImagePath('/tmp/logo.png')).toBe(true);
	expect(isImagePath('/tmp/photo.JPG')).toBe(true);
	expect(isImagePath('/tmp/anim.gif')).toBe(false);

	const path = pngFixture(2, 1, [255, 0, 0, 255, 0, 0, 255, 128]);
	const image = decodeImage(path);
	expect(image).toMatchObject({ width: 2, height: 1 });
	expect([...image.pixels]).toEqual([255, 0, 0, 255, 0, 0, 255, 128]);

	const packed = imageCells(rawImage(1, 2, [255, 0, 0, 255, 0, 0, 255, 255]), 10, 10);
	const odd = imageCells(rawImage(1, 1, [10, 20, 30, 255]), 10, 10);
	expect([...packed.cells]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
	expect([...odd.cells]).toEqual([10, 20, 30, 255, 0, 0, 0, 0]);
});

test('pdf helpers render pages as images', async () => {
	const { pdf } = pdfProject();
	expect(isPdfPath('/tmp/report.pdf')).toBe(true);
	expect(isPdfPath('/tmp/report.PDF')).toBe(true);
	expect(isPdfPath('/tmp/report.png')).toBe(false);
	expect(pdfRenderSize(20, 20, 10, 5, 100)).toEqual({ width: 10, height: 10 });
	expect(stepPdfZoom(100, 1)).toBe(125);
	expect(stepPdfZoom(25, -1)).toBe(25);

	const opened = await openPdf(pdf);
	expect(opened.pageCount).toBe(2);
	const red = await opened.renderPage(0, 10, 5, 100);
	expect(red).toMatchObject({ width: 10, height: 10 });
	expect(Array.from(red.pixels.slice(0, 4))).toEqual([255, 0, 0, 255]);
	const blue = await opened.renderPage(1, 10, 5, 100);
	expect(Array.from(blue.pixels.slice(0, 4))).toEqual([0, 0, 255, 255]);
	opened.close();
});

test('image files open as read-only viewer tabs', async () => {
	const { dir, png } = imageProject();
	const t = await launch(dir, {}, { width: 80, height: 24 }, { openFile: png });

	expect(t.captureCharFrame()).toContain('logo.png - 4x8 - 1 KB');
	expect(t.captureCharFrame()).toContain('▀');
	expect(t.captureCharFrame()).not.toContain('binary');
});

test('the file picker opens image tabs without creating editable buffers', async () => {
	const { dir, png } = imageProject();
	const t = await launch(dir, {}, { width: 80, height: 24 });

	await press(t, (input) => input.pressKey('o', { ctrl: true }));
	await press(t, (input) => void input.typeText('logo'));
	await press(t, (input) => input.pressEnter());
	await settle(t);

	expect(t.captureCharFrame()).toContain('logo.png - 4x8 - 1 KB');
	expect(t.captureCharFrame()).toContain('image');

	const before = [...(await Bun.file(png).bytes())];
	await press(t, (input) => input.pressKey('s', { ctrl: true }));
	expect([...(await Bun.file(png).bytes())]).toEqual(before);

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

	const second = await launch(dir, {}, { width: 80, height: 24 });
	expect(second.captureCharFrame()).toContain('logo.png - 4x8 - 1 KB');
});

test('pdf files open as read-only viewer tabs', async () => {
	const { dir, pdf } = pdfProject();
	const t = await launch(dir, {}, { width: 80, height: 24 }, { openFile: pdf });
	await until(t, () => t.captureCharFrame().includes('sample.pdf - 1/2 - 100%'), 100);

	expect(t.captureCharFrame()).toContain('sample.pdf - 1/2 - 100%');
	expect(t.captureCharFrame()).toContain('▀');
	expect(t.captureCharFrame()).toContain('pdf');

	const before = [...(await Bun.file(pdf).bytes())];
	await press(t, (input) => input.pressKey('s', { ctrl: true }));
	expect([...(await Bun.file(pdf).bytes())]).toEqual(before);
});

test('the file picker opens PDF tabs and restores them', async () => {
	const { dir } = pdfProject();
	const first = await launch(dir, {}, { width: 80, height: 24 });

	await press(first, (input) => input.pressKey('o', { ctrl: true }));
	await press(first, (input) => void input.typeText('sample'));
	await press(first, (input) => input.pressEnter());
	await until(first, () => first.captureCharFrame().includes('sample.pdf - 1/2 - 100%'), 100);
	expect(first.captureCharFrame()).toContain('sample.pdf - 1/2 - 100%');

	const second = await launch(dir, {}, { width: 80, height: 24 });
	await until(second, () => second.captureCharFrame().includes('sample.pdf - 1/2 - 100%'), 100);
	expect(second.captureCharFrame()).toContain('sample.pdf - 1/2 - 100%');
}, 60_000);
