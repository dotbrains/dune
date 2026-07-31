import type { TextareaRenderable } from '@opentui/core';
import { lineAt } from '../editor/window';

export function createEditorLayout(
	editor: () => TextareaRenderable | undefined,
	onForget: () => void,
) {
	let layout: { sources: number[]; widths: number[] } | null = null;
	const lineLayout = (): { sources: number[]; widths: number[] } => {
		const el = editor();
		if (!el) return { sources: [], widths: [] };
		if (!layout) {
			const info = el.lineInfo;
			layout = {
				sources: info.lineSources as number[],
				widths: info.lineWidthCols as number[],
			};
		}
		return layout;
	};
	const wrapMap = (): number[] => lineLayout().sources;
	const rowAtLine = (line: number): number => {
		const map = wrapMap();
		if (map.length === 0) return line;
		let low = 0;
		let high = map.length - 1;
		while (low < high) {
			const mid = (low + high) >> 1;
			if ((map[mid] ?? 0) < line) low = mid + 1;
			else high = mid;
		}
		return low;
	};
	return {
		lineLayout,
		wrapMap,
		lineAtRow: (row: number): number => lineAt(wrapMap(), row),
		rowAtLine,
		forget: () => {
			layout = null;
			onForget();
		},
	};
}

export function scrollTextarea(editor: TextareaRenderable, delta: number) {
	const scroller = editor as unknown as { onMouseEvent: (event: unknown) => void };
	scroller.onMouseEvent({
		type: 'scroll',
		x: editor.x + 1,
		y: editor.y + 1,
		scroll: { direction: delta > 0 ? 'down' : 'up', delta: Math.abs(delta) },
	});
}
