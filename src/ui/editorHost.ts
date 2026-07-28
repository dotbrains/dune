import type { MouseEvent, TextareaRenderable } from '@opentui/core';
import { useRenderer } from '@opentui/solid';

const selectionHosts = new WeakMap<object, unknown>();

export function allowSelectionOnlyInEditor(el: TextareaRenderable) {
	const renderer = useRenderer() as unknown as {
		startSelection: (renderable: unknown, x: number, y: number) => void;
	};
	const gated = selectionHosts.has(renderer);
	selectionHosts.set(renderer, el);
	if (gated) return;
	const start = renderer.startSelection.bind(renderer);
	renderer.startSelection = (renderable: unknown, x: number, y: number) => {
		if (renderable === selectionHosts.get(renderer)) start(renderable, x, y);
	};
}

export function afterResize(el: TextareaRenderable, after: () => void) {
	const host = el as unknown as { onResize: (width: number, height: number) => void };
	const resize = host.onResize.bind(host);
	host.onResize = (width: number, height: number) => {
		resize(width, height);
		after();
	};
}

export function ignoreScrollOutsideBounds(el: TextareaRenderable) {
	const host = el as unknown as { onMouseEvent: (event: MouseEvent) => void };
	const handle = host.onMouseEvent.bind(host);
	host.onMouseEvent = (event: MouseEvent) => {
		if (event.type === 'scroll') {
			const { x, y, width, height } = el;
			const inside = event.x >= x && event.x < x + width && event.y >= y && event.y < y + height;
			if (!inside) return;
		}
		handle(event);
	};
}
