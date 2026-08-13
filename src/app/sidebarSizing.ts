import type { Accessor } from 'solid-js';
import { sidebarColumns, SIDEBAR_MAX, SIDEBAR_MIN } from '../core/config';
import type { Config } from '../core/config';
import { EDITOR_MIN } from './constants';

export function createSidebarSizing(deps: {
	config: Config;
	width: Accessor<number>;
	patchConfig: (patch: Partial<Config>) => void;
}) {
	const treeWidth = () =>
		Math.max(
			0,
			Math.min(sidebarColumns(deps.config.sidebarWidth, deps.width()), deps.width() - EDITOR_MIN),
		);

	/**
	 * `x` is the divider's column under the pointer. On the left, the sidebar starts at
	 * column 0, so that column is the width itself; on the right, the sidebar ends at the
	 * last column, so the width is what's left of the terminal past the divider.
	 */
	const resizeSidebar = (x: number) => {
		const raw = deps.config.sidebarPosition === 'right' ? deps.width() - 1 - x : x;
		const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.round(raw)));
		if (next !== deps.config.sidebarWidth) deps.patchConfig({ sidebarWidth: next });
	};

	const nudgeSidebar = (delta: number) => resizeSidebar(treeWidth() + delta);

	return { nudgeSidebar, resizeSidebar, treeWidth };
}
