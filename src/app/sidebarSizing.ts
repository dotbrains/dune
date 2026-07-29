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

	const resizeSidebar = (width: number) => {
		const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.round(width)));
		if (next !== deps.config.sidebarWidth) deps.patchConfig({ sidebarWidth: next });
	};

	const nudgeSidebar = (delta: number) => resizeSidebar(treeWidth() + delta);

	return { nudgeSidebar, resizeSidebar, treeWidth };
}
