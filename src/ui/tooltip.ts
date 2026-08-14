import { createMemo, createSignal } from 'solid-js';

/** How long the pointer has to sit still before its target's tooltip shows. */
export const TOOLTIP_DWELL_MS = 400;

export interface HoverTooltip {
	/** The resting target's label, or null while nothing has been hovered long enough. */
	label: () => string | null;
	onOver: (id: string, label: string) => void;
	onOut: (id: string) => void;
}

/**
 * Waits out a dwell before showing a tooltip, so a pointer travelling across several
 * targets on its way elsewhere does not flash one chip after another — only the target
 * the pointer actually stops on. Any hover *tint* a caller paints on the target itself
 * should stay instant; only this label is delayed.
 *
 * Leaving a target hides the label immediately, but what it already earned — a
 * completed dwell — is only forgotten a microtask later. Two `<text>` children of one
 * target deliver an `out` and the next `over` in the same turn, and clearing the earned
 * state synchronously would restart the dwell mid-target under the pointer.
 */
export function createHoverTooltip(enabled: () => boolean): HoverTooltip {
	const [hoveredId, setHoveredId] = createSignal<string | null>(null);
	const [dwellTick, setDwellTick] = createSignal(0);
	const labels = new Map<string, string>();
	const satisfied = new Set<string>();
	let timer: ReturnType<typeof setTimeout> | null = null;

	const clearTimer = () => {
		if (timer) clearTimeout(timer);
		timer = null;
	};

	const onOver = (id: string, label: string) => {
		labels.set(id, label);
		if (!enabled() || hoveredId() === id) return;
		setHoveredId(id);
		if (!satisfied.has(id)) {
			clearTimer();
			timer = setTimeout(() => {
				satisfied.add(id);
				setDwellTick((n) => n + 1);
			}, TOOLTIP_DWELL_MS);
		}
	};

	const onOut = (id: string) => {
		if (hoveredId() !== id) return;
		setHoveredId(null);
		queueMicrotask(() => {
			if (hoveredId() !== id) {
				satisfied.delete(id);
				clearTimer();
			}
		});
	};

	const label = createMemo(() => {
		dwellTick();
		const id = hoveredId();
		return id !== null && satisfied.has(id) ? (labels.get(id) ?? null) : null;
	});

	return { label, onOver, onOut };
}
