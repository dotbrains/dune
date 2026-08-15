import { describe, expect, test } from 'bun:test';

import type { MouseEvent, TextareaRenderable } from '@opentui/core';

import { allowScrollPastEnd, ignoreScrollOutsideBounds } from '../src/ui/editorHost';

/** A stand-in for the textarea: the renderer only needs bounds and the hook. */
function fakeEditor(seen: MouseEvent[]) {
	return {
		x: 30,
		y: 1,
		width: 50,
		height: 18,
		onMouseEvent(event: MouseEvent) {
			seen.push(event);
		},
	} as unknown as TextareaRenderable;
}

const event = (type: string, x: number, y: number) => ({ type, x, y }) as unknown as MouseEvent;

describe('scroll delivered to the focused editor', () => {
	test('is dropped when the pointer is over the sidebar', () => {
		const seen: MouseEvent[] = [];
		const editor = fakeEditor(seen);
		ignoreScrollOutsideBounds(editor);

		// The renderer's hit test misses the tree and falls back to the focused editor.
		(editor as unknown as { onMouseEvent: (e: MouseEvent) => void }).onMouseEvent(
			event('scroll', 3, 8),
		);
		expect(seen).toHaveLength(0);
	});

	test('still scrolls when the pointer is over the editor', () => {
		const seen: MouseEvent[] = [];
		const editor = fakeEditor(seen);
		ignoreScrollOutsideBounds(editor);
		(editor as unknown as { onMouseEvent: (e: MouseEvent) => void }).onMouseEvent(
			event('scroll', 59, 8),
		);
		expect(seen).toHaveLength(1);
	});

	test('leaves every other mouse event alone, wherever it lands', () => {
		const seen: MouseEvent[] = [];
		const editor = fakeEditor(seen);
		ignoreScrollOutsideBounds(editor);
		(editor as unknown as { onMouseEvent: (e: MouseEvent) => void }).onMouseEvent(
			event('down', 3, 8),
		);
		expect(seen).toHaveLength(1);
	});
});

function resizeEditor(offsetY: number, total: number, height: number) {
	const view = {
		port: { offsetX: 0, offsetY, width: 40, height },
		margin: 0.2,
		getViewport() {
			return this.port;
		},
		getTotalVirtualLineCount() {
			return total;
		},
		setScrollMargin(next: number) {
			this.margin = next;
		},
		setViewport(offsetX: number, nextOffsetY: number, width: number, nextHeight: number) {
			this.port = { offsetX, offsetY: nextOffsetY, width, height: nextHeight };
		},
	};
	let renders = 0;
	const editor = {
		editorView: view,
		requestRender() {
			renders++;
		},
		handleScroll() {},
		onResize(_width: number, nextHeight: number) {
			view.port = {
				...view.port,
				height: nextHeight,
				offsetY: Math.max(0, Math.min(view.port.offsetY, total - nextHeight)),
			};
		},
	} as unknown as TextareaRenderable;
	return { editor, view, renders: () => renders };
}

describe('scrolling past the last full editor page', () => {
	test('survives a resize while the view is past the end', () => {
		const { editor, view, renders } = resizeEditor(96, 100, 10);
		allowScrollPastEnd(editor, () => true);

		(editor as unknown as { onResize: (width: number, height: number) => void }).onResize(39, 10);

		expect(view.port.offsetY).toBe(96);
		expect(view.margin).toBe(0);
		expect(renders()).toBe(1);
	});

	test('leaves ordinary resize clamping alone', () => {
		const { editor, view, renders } = resizeEditor(50, 100, 10);
		allowScrollPastEnd(editor, () => true);

		(editor as unknown as { onResize: (width: number, height: number) => void }).onResize(39, 10);

		expect(view.port.offsetY).toBe(50);
		expect(renders()).toBe(0);
	});
});
