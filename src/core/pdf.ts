import { extname } from 'node:path';

import { PDFiumLibrary } from '@hyzyla/pdfium';
import type { PDFiumDocument } from '@hyzyla/pdfium';
import wasmPath from '@hyzyla/pdfium/pdfium.wasm' with { type: 'file' };

import type { RawImage } from './image';

export const PDF_ZOOM_MIN = 25;
export const PDF_ZOOM_MAX = 400;
export const PDF_ZOOM_STEP = 25;

export interface PdfFile {
	pageCount: number;
	bytes: number;
	renderPage: (page: number, maxCols: number, maxRows: number, zoom: number) => Promise<RawImage>;
	close: () => void;
}

let libraryPromise: Promise<PDFiumLibrary> | null = null;

function library(): Promise<PDFiumLibrary> {
	libraryPromise ??= Bun.file(wasmPath)
		.arrayBuffer()
		.then((wasmBinary) => PDFiumLibrary.init({ wasmBinary }));
	return libraryPromise;
}

export function isPdfPath(path: string): boolean {
	return extname(path).toLowerCase() === '.pdf';
}

export function stepPdfZoom(zoom: number, direction: -1 | 1): number {
	return Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, zoom + direction * PDF_ZOOM_STEP));
}

export function pdfRenderSize(
	pageWidth: number,
	pageHeight: number,
	maxCols: number,
	maxRows: number,
	zoom: number,
): { width: number; height: number } {
	if (pageWidth <= 0 || pageHeight <= 0 || !Number.isFinite(pageWidth + pageHeight))
		throw new TypeError('PDF page has no size');
	if (!Number.isFinite(maxCols) || !Number.isFinite(maxRows) || !Number.isFinite(zoom))
		throw new TypeError('PDF render size is invalid');

	const viewportWidth = Math.max(1, Math.floor(maxCols));
	const viewportHeight = Math.max(1, Math.floor(maxRows) * 2);
	const fit = Math.min(viewportWidth / pageWidth, viewportHeight / pageHeight);
	const scale = fit * (Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, zoom)) / 100);
	const width = Math.max(1, Math.round(pageWidth * scale));
	const height = Math.max(1, Math.round(pageHeight * scale));
	if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height))
		throw new TypeError('PDF render size is invalid');
	return { width, height };
}

export async function openPdf(path: string): Promise<PdfFile> {
	const source = await Bun.file(path).bytes();
	const document: PDFiumDocument = await (await library()).loadDocument(source);
	const pageCount = document.getPageCount();
	if (pageCount < 1) {
		document.destroy();
		throw new Error('PDF has no pages');
	}
	let closed = false;

	const close = () => {
		if (closed) return;
		closed = true;
		document.destroy();
	};

	const renderPage: PdfFile['renderPage'] = async (page, maxCols, maxRows, zoom) => {
		if (closed) throw new Error('PDF is closed');
		if (!Number.isInteger(page) || page < 0 || page >= pageCount)
			throw new Error(`PDF page ${page + 1} is out of range`);
		const pdfPage = document.getPage(page);
		const { originalWidth, originalHeight } = pdfPage.getOriginalSize();
		const size = pdfRenderSize(originalWidth, originalHeight, maxCols, maxRows, zoom);
		const rendered = await pdfPage.render({
			...size,
			render: async ({ data }) => data,
		});
		return {
			width: rendered.width,
			height: rendered.height,
			pixels: rendered.data,
			bytes: source.byteLength,
		};
	};

	return { pageCount, bytes: source.byteLength, renderPage, close };
}
