import { basename } from 'node:path';

import { RGBA } from '@opentui/core';
import type { BoxRenderable, OptimizedBuffer } from '@opentui/core';
import { createMemo, createSignal, Show } from 'solid-js';

import { decodeImage, imageCells } from '../core/image';
import type { CellImage, RawImage } from '../core/image';
import { ui } from '../themes';

interface LoadedImage {
	image: RawImage;
	size: string;
}

export function ImageView(props: {
	path: string;
	width: number;
	height: number;
	onFocus: () => void;
}) {
	const [host, setHost] = createSignal<BoxRenderable | null>(null);
	const loaded = createMemo<LoadedImage | Error>(() => {
		try {
			const image = decodeImage(props.path);
			return { image, size: `${Math.max(1, Math.round(image.bytes / 1024))} KB` };
		} catch (error) {
			return error instanceof Error ? error : new Error(String(error));
		}
	});
	const cells = createMemo<CellImage | null>(() => {
		const current = loaded();
		if (current instanceof Error) return null;
		return imageCells(current.image, Math.max(1, props.width), Math.max(1, props.height - 1));
	});
	const painted = createMemo(() => {
		const grid = cells();
		if (!grid) return null;
		const bg = RGBA.fromHex(ui.bg);
		const colors: ({ fg: RGBA; bg: RGBA } | null)[] = Array.from({
			length: grid.cols * grid.rows,
		});
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
	});
	const caption = () => {
		const current = loaded();
		if (current instanceof Error)
			return `${basename(props.path)} cannot be shown: ${current.message}`;
		return `${basename(props.path)} - ${current.image.width}x${current.image.height} - ${current.size}`;
	};
	const draw = (buffer: OptimizedBuffer) => {
		const box = host();
		const image = painted();
		if (!box || !image) return;
		const left = box.x + Math.max(0, Math.floor((box.width - image.cols) / 2));
		const top = box.y + Math.max(0, Math.floor((box.height - image.rows) / 2));
		for (let row = 0; row < image.rows; row++) {
			for (let col = 0; col < image.cols; col++) {
				const cell = image.colors[row * image.cols + col];
				if (cell) buffer.setCellWithAlphaBlending(left + col, top + row, '▀', cell.fg, cell.bg);
			}
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
			<text fg={ui.dim} bg={ui.bg} content={` ${caption()}`} />
			<Show when={painted()}>
				<box flexGrow={1} backgroundColor={ui.bg} ref={setHost} renderAfter={draw} />
			</Show>
		</box>
	);
}
