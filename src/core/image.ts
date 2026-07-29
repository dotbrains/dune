import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

import { convertIndexedToRgb, decode as decodePng } from 'fast-png';
import { decode as decodeJpeg } from 'jpeg-js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

export interface RawImage {
	width: number;
	height: number;
	pixels: Uint8Array;
	bytes: number;
}

export interface CellImage {
	cols: number;
	rows: number;
	cells: Uint8Array;
}

export function isImagePath(path: string): boolean {
	return IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
}

export function decodeImage(path: string): RawImage {
	const file = readFileSync(path);
	const ext = extname(path).toLowerCase();
	if (ext === '.png') {
		const png = decodePng(file);
		const data = png.palette ? convertIndexedToRgb(png) : png.data;
		const channels = png.palette ? 3 : png.channels;
		return {
			width: png.width,
			height: png.height,
			pixels: rgbaPixels(data, png.width * png.height, channels, png.palette ? 8 : png.depth),
			bytes: file.byteLength,
		};
	}
	const jpg = decodeJpeg(file, { useTArray: true, formatAsRGBA: true });
	return { width: jpg.width, height: jpg.height, pixels: jpg.data, bytes: file.byteLength };
}

function rgbaPixels(
	data: Uint8Array | Uint8ClampedArray | Uint16Array,
	count: number,
	channels: number,
	depth: number,
): Uint8Array {
	const sample =
		depth === 16 ? (idx: number) => (data[idx] ?? 0) >> 8 : (idx: number) => data[idx] ?? 0;
	const out = new Uint8Array(count * 4);
	for (let pixel = 0; pixel < count; pixel++) {
		const source = pixel * channels;
		const target = pixel * 4;
		if (channels >= 3) {
			out[target] = sample(source);
			out[target + 1] = sample(source + 1);
			out[target + 2] = sample(source + 2);
			out[target + 3] = channels === 4 ? sample(source + 3) : 255;
		} else {
			const grey = sample(source);
			out[target] = grey;
			out[target + 1] = grey;
			out[target + 2] = grey;
			out[target + 3] = channels === 2 ? sample(source + 1) : 255;
		}
	}
	return out;
}

export function imageCells(image: RawImage, maxCols: number, maxRows: number): CellImage {
	const scale = Math.min(maxCols / image.width, (maxRows * 2) / image.height, 1);
	const cols = Math.max(1, Math.round(image.width * scale));
	const pixelRows = Math.max(1, Math.round(image.height * scale));
	const rows = Math.ceil(pixelRows / 2);
	const cells = new Uint8Array(cols * rows * 8);
	for (let y = 0; y < pixelRows; y++) {
		for (let x = 0; x < cols; x++) {
			const cell = (Math.floor(y / 2) * cols + x) * 8 + (y % 2) * 4;
			cells.set(averageSource(image, x, y, cols, pixelRows), cell);
		}
	}
	return { cols, rows, cells };
}

function averageSource(
	image: RawImage,
	tx: number,
	ty: number,
	targetWidth: number,
	targetHeight: number,
): [number, number, number, number] {
	const x0 = Math.floor((tx * image.width) / targetWidth);
	const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * image.width) / targetWidth));
	const y0 = Math.floor((ty * image.height) / targetHeight);
	const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * image.height) / targetHeight));
	let r = 0;
	let g = 0;
	let b = 0;
	let a = 0;
	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			const at = (y * image.width + x) * 4;
			r += image.pixels[at]!;
			g += image.pixels[at + 1]!;
			b += image.pixels[at + 2]!;
			a += image.pixels[at + 3]!;
		}
	}
	const samples = (x1 - x0) * (y1 - y0);
	return [
		Math.round(r / samples),
		Math.round(g / samples),
		Math.round(b / samples),
		Math.round(a / samples),
	];
}
