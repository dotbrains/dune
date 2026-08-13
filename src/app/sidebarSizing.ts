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

	const applyWidth = (width: number) => {
		const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.round(width)));
		if (next !== deps.config.sidebarWidth) deps.patchConfig({ sidebarWidth: next });
	};

	/**
	 * `x` is the divider's column under the pointer, not a width — on the left the sidebar
	 * starts at column 0, so that column already is the width; on the right the sidebar ends
	 * at the last column, so the width is what's left of the terminal past the divider.
	 * `nudgeSidebar` already has a width, so it applies it directly instead of going through
	 * this pointer-to-width conversion a second time.
	 */
	const resizeSidebar = (x: number) =>
		applyWidth(deps.config.sidebarPosition === 'right' ? deps.width() - 1 - x : x);

	const nudgeSidebar = (delta: number) => applyWidth(treeWidth() + delta);

	return { nudgeSidebar, resizeSidebar, treeWidth };
}
