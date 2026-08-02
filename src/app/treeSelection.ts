import { join } from 'node:path';
import type { Accessor, Setter } from 'solid-js';
import type { TreeNode } from '../core/fs';
import type { Focus } from './types';

export function createTreeSelection(deps: {
	rootDir: string;
	nodes: Accessor<TreeNode[]>;
	sidebar: Accessor<boolean>;
	selectedPath: Accessor<string | null>;
	anchor: Accessor<string | null>;
	setExpanded: Setter<Set<string>>;
	setSelectedPath: Setter<string | null>;
	setMarked: Setter<string[]>;
	setAnchor: Setter<string | null>;
	setSidebar: Setter<boolean>;
	setFocus: Setter<Focus>;
}) {
	const reveal = (path: string) => {
		const parts = path.startsWith(deps.rootDir)
			? path.slice(deps.rootDir.length + 1).split('/')
			: [];
		if (parts.length < 2) return;
		deps.setExpanded((prev) => {
			const next = new Set(prev);
			let dir = deps.rootDir;
			for (const part of parts.slice(0, -1)) {
				dir = join(dir, part);
				next.add(dir);
			}
			return next.size === prev.size ? prev : next;
		});
	};

	const focusTree = () => {
		const path = deps.selectedPath();
		if (path) reveal(path);
		if (!deps.nodes().some((n) => n.path === deps.selectedPath())) {
			deps.setSelectedPath(deps.nodes()[0]?.path ?? null);
		}
		deps.setFocus('tree');
	};

	const moveSelection = (delta: number) => {
		const rows = deps.nodes();
		if (rows.length === 0) return;
		const idx = rows.findIndex((n) => n.path === deps.selectedPath());
		const next = idx < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, idx + delta));
		deps.setSelectedPath(rows[next]!.path);
		deps.setMarked([]);
		deps.setAnchor(null);
	};

	const extendSelection = (delta: number) => {
		const rows = deps.nodes();
		const head = rows.findIndex((n) => n.path === deps.selectedPath());
		if (rows.length === 0 || head < 0) return moveSelection(delta);
		const from = deps.anchor() ?? rows[head]!.path;
		if (!deps.anchor()) deps.setAnchor(from);
		const start = rows.findIndex((n) => n.path === from);
		const next = Math.max(0, Math.min(rows.length - 1, head + delta));
		const [lo, hi] = start <= next ? [start, next] : [next, start];
		deps.setMarked(rows.slice(lo, hi + 1).map((n) => n.path));
		deps.setSelectedPath(rows[next]!.path);
	};

	const collapseAll = (): boolean => {
		let nextSelected = deps.selectedPath();
		let changed = false;
		deps.setExpanded((prev) => {
			if (prev.size === 0) return prev;
			changed = true;
			const selected = deps.selectedPath();
			if (selected) {
				const parent = [...prev]
					.toSorted((a, b) => a.length - b.length)
					.find((path) => selected === path || selected.startsWith(`${path}/`));
				nextSelected = parent ?? selected;
			}
			return new Set<string>();
		});
		if (!changed) return false;
		deps.setSelectedPath(nextSelected);
		deps.setMarked([]);
		deps.setAnchor(null);
		return true;
	};

	const toggleSidebar = () => {
		if (deps.sidebar()) {
			deps.setSidebar(false);
			deps.setFocus('editor');
			return;
		}
		deps.setSidebar(true);
		focusTree();
	};

	return { collapseAll, extendSelection, focusTree, moveSelection, reveal, toggleSidebar };
}
