import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encode } from 'fast-png';

import { decodeImage, imageCells, isImagePath } from '../src/core/image';
import type { RawImage } from '../src/core/image';

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

describe('isImagePath', () => {
	test('matches decodable still image extensions', () => {
		expect(isImagePath('/tmp/logo.png')).toBe(true);
		expect(isImagePath('/tmp/photo.JPG')).toBe(true);
		expect(isImagePath('/tmp/photo.jpeg')).toBe(true);
		expect(isImagePath('/tmp/anim.gif')).toBe(false);
		expect(isImagePath('/tmp/main.ts')).toBe(false);
	});
});

describe('decodeImage', () => {
	test('reads PNG dimensions and RGBA pixels', () => {
		const path = pngFixture(2, 1, [255, 0, 0, 255, 0, 0, 255, 128]);
		const image = decodeImage(path);

		expect(image.width).toBe(2);
		expect(image.height).toBe(1);
		expect([...image.pixels]).toEqual([255, 0, 0, 255, 0, 0, 255, 128]);
		expect(image.bytes).toBeGreaterThan(0);
	});

	test('throws on a mislabeled non-image', () => {
		const dir = mkdtempSync(join(tmpdir(), 'dune-image-'));
		const path = join(dir, 'fake.png');
		writeFileSync(path, 'not actually a png');

		expect(() => decodeImage(path)).toThrow();
	});
});

describe('imageCells', () => {
	test('packs top and bottom image pixels into one terminal cell', () => {
		const image = rawImage(1, 2, [255, 0, 0, 255, 0, 0, 255, 255]);

		expect([...imageCells(image, 10, 10).cells]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
	});

	test('leaves the lower cell half transparent for an odd image row', () => {
		const cells = imageCells(rawImage(1, 1, [10, 20, 30, 255]), 10, 10);

		expect([...cells.cells]).toEqual([10, 20, 30, 255, 0, 0, 0, 0]);
	});

	test('downscales to fit without upscaling', () => {
		const small = rawImage(
			2,
			2,
			Array.from({ length: 16 }, () => 255),
		);
		const large = rawImage(
			100,
			100,
			Array.from({ length: 100 * 100 * 4 }, () => 128),
		);

		expect(imageCells(small, 100, 100)).toMatchObject({ cols: 2, rows: 1 });
		expect(imageCells(large, 10, 100)).toMatchObject({ cols: 10, rows: 5 });
	});
});
