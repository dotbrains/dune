import { createEffect, createSignal, on } from 'solid-js';

import { exists } from '../../core/fs';

interface Stop {
	path: string;
	line: number;
	col: number;
}

const MAX_STOPS = 60;

export function createNavigation(deps: {
	activePath: () => string | null;
	cursor: () => { line: number; col: number };
	openFile: (path: string) => void;
	setFocus: (focus: 'editor') => void;
	setGoto: (
		update: (prev: { line: number; col: number; key: number } | null) => {
			line: number;
			col: number;
			key: number;
		},
	) => void;
	say: (msg: string) => void;
}) {
	const [stops, setStops] = createSignal<Stop[]>([]);
	const [at, setAt] = createSignal(-1);
	const current = () => stops()[at()];

	const push = (stop: Stop) => {
		const kept = [...stops().slice(0, at() + 1), stop].slice(-MAX_STOPS);
		setStops(kept);
		setAt(kept.length - 1);
	};

	createEffect(
		on(deps.cursor, (position) => {
			const stop = current();
			if (!stop || stop.path !== deps.activePath()) return;
			stop.line = position.line;
			stop.col = position.col;
		}),
	);

	createEffect(
		on(deps.activePath, (path) => {
			if (!path || current()?.path === path) return;
			push({ path, line: 0, col: 0 });
		}),
	);

	const mark = () => {
		const stop = current();
		if (stop) push({ ...stop });
	};

	const go = (delta: 1 | -1) => {
		const list = stops();
		let index = at() + delta;
		while (list[index] && !exists(list[index]!.path)) index += delta;
		const stop = list[index];
		if (!stop) {
			if (list.length > 0) {
				const kept = delta < 0 ? list.slice(at()) : list.slice(0, at() + 1);
				setStops(kept);
				setAt(delta < 0 ? 0 : kept.length - 1);
			}
			return deps.say(delta < 0 ? 'Nothing to go back to' : 'Nothing to go forward to');
		}
		setAt(index);
		deps.openFile(stop.path);
		deps.setGoto((prev) => ({ line: stop.line, col: stop.col, key: (prev?.key ?? 0) + 1 }));
		deps.setFocus('editor');
	};

	return {
		canBack: () => at() > 0,
		canForward: () => at() < stops().length - 1,
		back: () => go(-1),
		forward: () => go(1),
		mark,
	};
}

export type Navigation = ReturnType<typeof createNavigation>;
