import { basename } from 'node:path';

import { RGBA } from '@opentui/core';
import type { BoxRenderable, KeyEvent, OptimizedBuffer } from '@opentui/core';
import { useKeyboard, useRenderer } from '@opentui/solid';
import { createEffect, createMemo, createSignal, on, onCleanup, Show } from 'solid-js';

import { imageCells } from '../../core/image';
import type { CellImage } from '../../core/image';
import { openPdf, stepPdfZoom } from '../../core/pdf';
import type { PdfFile } from '../../core/pdf';
import { ui } from '../../themes';

interface PaintedPdf {
	cols: number;
	rows: number;
	colors: Array<{ fg: RGBA; bg: RGBA } | null>;
}

function halfBlockColors(grid: CellImage): PaintedPdf {
	const bg = RGBA.fromHex(ui.bg);
	const colors: PaintedPdf['colors'] = Array.from({ length: grid.cols * grid.rows });
	for (let idx = 0; idx < colors.length; idx++) {
		const at = idx * 8;
		const topAlpha = grid.cells[at + 3]!;
		const bottomAlpha = grid.cells[at + 7]!;
		if (topAlpha === 0 && bottomAlpha === 0) {
			colors[idx] = null;
			continue;
		}
		const color = (offset: number, alpha: number) =>
			alpha === 0
				? bg
				: RGBA.fromInts(
						grid.cells[offset]!,
						grid.cells[offset + 1]!,
						grid.cells[offset + 2]!,
						alpha,
					);
		colors[idx] = { fg: color(at, topAlpha), bg: color(at + 4, bottomAlpha) };
	}
	return { cols: grid.cols, rows: grid.rows, colors };
}

export function PdfView(props: {
	path: string;
	width: number;
	height: number;
	focused: boolean;
	blocked: boolean;
	onFocus: () => void;
}) {
	const renderer = useRenderer();
	const [host, setHost] = createSignal<BoxRenderable | null>(null);
	const [pdf, setPdf] = createSignal<PdfFile | null>(null);
	const [page, setPage] = createSignal(0);
	const [zoom, setZoom] = createSignal(100);
	const [pan, setPan] = createSignal({ x: 0, y: 0 });
	const [cells, setCells] = createSignal<CellImage | null>(null);
	const [loading, setLoading] = createSignal(true);
	const [error, setError] = createSignal<string | null>(null);

	let opened: PdfFile | null = null;
	let version = 0;

	createEffect(
		on(
			() => props.path,
			async (path) => {
				const mine = ++version;
				opened?.close();
				opened = null;
				setPdf(null);
				setPage(0);
				setZoom(100);
				setPan({ x: 0, y: 0 });
				setCells(null);
				setError(null);
				setLoading(true);
				try {
					const next = await openPdf(path);
					if (mine !== version) {
						next.close();
						return;
					}
					opened = next;
					setPdf(next);
				} catch (cause) {
					if (mine === version) setError((cause as Error).message);
				} finally {
					if (mine === version) setLoading(false);
				}
			},
			{ defer: false },
		),
	);

	onCleanup(() => {
		version++;
		opened?.close();
		opened = null;
	});

	createEffect(async () => {
		const current = pdf();
		if (!current) return;
		const mine = ++version;
		const currentPage = page();
		const currentZoom = zoom();
		const cols = Math.max(1, Math.floor(props.width));
		const rows = Math.max(1, Math.floor(props.height - 1));
		setLoading(true);
		try {
			const image = await current.renderPage(currentPage, cols, rows, currentZoom);
			if (mine !== version) return;
			const next = imageCells(image, image.width, Math.ceil(image.height / 2));
			setCells(next);
			setPan({ x: 0, y: 0 });
			setError(null);
		} catch (cause) {
			if (mine === version) setError((cause as Error).message);
		} finally {
			if (mine === version) setLoading(false);
		}
	});

	const painted = createMemo(() => {
		const grid = cells();
		return grid ? halfBlockColors(grid) : null;
	});

	const movePage = (delta: number) => {
		const current = pdf();
		if (!current) return;
		setPage((p) => Math.max(0, Math.min(current.pageCount - 1, p + delta)));
	};

	const movePan = (dx: number, dy: number) => {
		const image = painted();
		const box = host();
		if (!image || !box) return;
		setPan((p) => ({
			x: Math.max(0, Math.min(Math.max(0, image.cols - box.width), p.x + dx)),
			y: Math.max(0, Math.min(Math.max(0, image.rows - box.height), p.y + dy)),
		}));
		renderer.requestRender();
	};

	useKeyboard((key: KeyEvent) => {
		if (props.blocked || !props.focused || key.defaultPrevented) return;
		const k = key.name;
		if (k === 'pageup' || k === 'k') movePage(-1);
		else if (k === 'pagedown' || k === 'j' || k === 'space') movePage(1);
		else if (k === '+' || k === '=') setZoom((z) => stepPdfZoom(z, 1));
		else if (k === '-') setZoom((z) => stepPdfZoom(z, -1));
		else if (k === '0') setZoom(100);
		else if (k === 'left') movePan(-4, 0);
		else if (k === 'right') movePan(4, 0);
		else if (k === 'up') movePan(0, -2);
		else if (k === 'down') movePan(0, 2);
		else return;
		key.preventDefault();
	});

	const caption = () => {
		const name = basename(props.path);
		const failure = error();
		if (failure) return `Cannot show ${name}: ${failure}`;
		const current = pdf();
		if (!current) return `${name} - loading`;
		const size = `${Math.max(1, Math.round(current.bytes / 1024))} KB`;
		const base = `${name} - ${page() + 1}/${current.pageCount} - ${zoom()}% - ${size}`;
		return loading() ? `${base} - rendering` : base;
	};

	const draw = (buffer: OptimizedBuffer) => {
		const box = host();
		const image = painted();
		if (!box || !image) return;
		const offset = {
			x: Math.max(0, Math.min(Math.max(0, image.cols - box.width), pan().x)),
			y: Math.max(0, Math.min(Math.max(0, image.rows - box.height), pan().y)),
		};
		const cols = Math.min(box.width, image.cols - offset.x);
		const rows = Math.min(box.height, image.rows - offset.y);
		const left = box.x + Math.max(0, Math.floor((box.width - image.cols) / 2));
		const top = box.y + Math.max(0, Math.floor((box.height - image.rows) / 2));
		buffer.pushScissorRect(box.x, box.y, box.width, box.height);
		try {
			for (let row = 0; row < rows; row++) {
				for (let col = 0; col < cols; col++) {
					const cell = image.colors[(row + offset.y) * image.cols + col + offset.x];
					if (cell) buffer.setCellWithAlphaBlending(left + col, top + row, '▀', cell.fg, cell.bg);
				}
			}
		} finally {
			buffer.popScissorRect();
		}
	};

	return (
		<box
			width="100%"
			height="100%"
			flexDirection="column"
			backgroundColor={ui.bg}
			onMouseDown={() => props.onFocus()}
		>
			<box flexDirection="row" backgroundColor={ui.bg}>
				<text fg={ui.dim} bg={ui.bg} flexShrink={0} content={` ${caption()}`} />
				<box flexGrow={1} backgroundColor={ui.bg} />
				<text
					fg={ui.faint}
					bg={ui.bg}
					flexShrink={0}
					content=" PgUp/PgDn page - +/- zoom - arrows pan - 0 fit "
				/>
			</box>
			<Show when={painted()}>
				<box flexGrow={1} backgroundColor={ui.bg} ref={setHost} renderAfter={draw} />
			</Show>
		</box>
	);
}
