import { basename, dirname, join, relative, sep } from 'node:path';

import { unwrap } from 'solid-js/store';

import { copyAll, moveAll } from '../core/bulk';
import { copyToClipboard } from '../core/clipboard';
import type { TreeNode } from '../core/fs';
import { exists, freePath, rename } from '../core/fs';
import type { Tone } from '../ui/StatusBar';
import { within } from './pathRules';
import type { BufferState, Prompt } from './types';

const whyNotMove = (path: string, dir: string): string | null => {
	if (dirname(path) === dir) return `${basename(path)} is already there`;
	if (within(dir, path)) return `Cannot move ${basename(path)} into itself`;
	return null;
};

export function createFileActions(deps: {
	rootDir: string;
	buffers: Record<string, BufferState>;
	nodes: () => TreeNode[];
	tabs: () => string[];
	activePath: () => string | null;
	previewPath: () => string | null;
	recentlyClosed: () => string[];
	clipboard: () => { paths: string[]; mode: 'cut' | 'copy' };
	marked: () => string[];
	selectedPath: () => string | null;
	sidebar: () => boolean;
	setBuffers: (...args: unknown[]) => void;
	setTabs: (update: string[] | ((prev: string[]) => string[])) => void;
	setActivePath: (path: string | null) => void;
	setPreviewPath: (path: string | null) => void;
	setSelectedPath: (path: string | null) => void;
	setExpanded: (update: (prev: Set<string>) => Set<string>) => void;
	setMarked: (paths: string[]) => void;
	setAnchor: (path: string | null) => void;
	setClipboard: (clipboard: { paths: string[]; mode: 'cut' | 'copy' }) => void;
	setRecentlyClosed: (update: (prev: string[]) => string[]) => void;
	setPrompt: (prompt: Prompt) => void;
	setBusy: (busy: { label: string; done: number; total: number } | null) => void;
	say: (msg: string, tone?: Tone) => void;
	whileFree: (run: () => void) => void;
	renderer: { copyToClipboardOSC52: (text: string) => void };
	refreshTree: () => void;
	expand: (path: string) => void;
	discardBuffer: (path: string) => void;
	focusTree: () => void;
	openFile: (path: string, preview?: boolean) => void;
	toggleExpand: (path: string) => void;
}) {
	const adoptMove = (from: string, to: string) => {
		const inside = `${from}/`;
		const remap = (path: string) =>
			path === from ? to : path.startsWith(inside) ? to + path.slice(from.length) : path;
		deps.setTabs((prev) => prev.map(remap));
		for (const path of Object.keys(unwrap(deps.buffers))) {
			const next = remap(path);
			if (next === path) continue;
			deps.setBuffers(next, { ...deps.buffers[path]! });
			deps.discardBuffer(path);
		}
		const active = deps.activePath();
		if (active) deps.setActivePath(remap(active));
		const preview = deps.previewPath();
		if (preview) deps.setPreviewPath(remap(preview));
		deps.setSelectedPath(to);
		deps.setExpanded((prev) => new Set([...prev].map(remap)));
	};
	const movePath = (from: string, to: string): string | null => {
		const err = rename(from, to);
		if (err) return err;
		adoptMove(from, to);
		return null;
	};
	const moveInto = (path: string, dir: string) => {
		const refused = whyNotMove(path, dir);
		if (refused) return deps.say(refused, 'warn');
		const err = movePath(path, join(dir, basename(path)));
		if (err) return deps.say(err, 'error');
		deps.expand(dir);
		deps.say(
			`Moved ${basename(path)} to ${relative(deps.rootDir, dir) || basename(deps.rootDir)}/`,
		);
	};
	const moveAllInto = (paths: string[], dir: string) => {
		if (paths.length === 1) return moveInto(paths[0]!, dir);
		const refused: string[] = [];
		const movable = paths.filter((path) => {
			if (!whyNotMove(path, dir)) return true;
			refused.push(basename(path));
			return false;
		});
		deps.setMarked([]);
		deps.setAnchor(null);
		deps.whileFree(
			() =>
				void (async () => {
					deps.setBusy({ label: 'Moving', done: 0, total: movable.length });
					const { done, failed, moved } = await moveAll(
						movable,
						dir,
						(into, base) => join(into, base),
						(progress) =>
							deps.setBusy({ label: 'Moving', done: progress.done, total: progress.total }),
					);
					deps.setBusy(null);
					for (const { from, to } of moved) adoptMove(from, to);
					if (done > 0) deps.expand(dir);
					deps.refreshTree();
					const where = relative(deps.rootDir, dir) || basename(deps.rootDir);
					const left = [...refused, ...failed];
					if (left.length === 0) return deps.say(`Moved ${done} items to ${where}/`);
					deps.say(`Moved ${done} to ${where}/ — left ${left.join(', ')}`, 'warn');
				})(),
		);
	};
	const selectedNode = () => deps.nodes().find((n) => n.path === deps.selectedPath());
	const targetDir = () => {
		const node = selectedNode();
		if (!node) return deps.rootDir;
		return node.isDir ? node.path : dirname(node.path);
	};
	const actionTargets = (): string[] => {
		const all = deps.marked();
		if (all.length > 0) return all;
		const path = deps.selectedPath();
		return path ? [path] : [];
	};
	const copyAllInto = (paths: string[], dir: string) => {
		const refused: string[] = [];
		const copyable = paths.filter((path) => {
			if (!within(dir, path)) return true;
			refused.push(basename(path));
			return false;
		});
		deps.setMarked([]);
		deps.setAnchor(null);
		if (copyable.length === 0)
			return deps.say(`Cannot copy ${refused.join(', ')} into itself`, 'warn');
		deps.whileFree(
			() =>
				void (async () => {
					deps.setBusy({ label: 'Copying', done: 0, total: copyable.length });
					const { done, failed } = await copyAll(copyable, dir, freePath, (progress) =>
						deps.setBusy({ label: 'Copying', done: progress.done, total: progress.total }),
					);
					deps.setBusy(null);
					if (done === 0) return;
					deps.expand(dir);
					deps.refreshTree();
					const where = relative(deps.rootDir, dir) || basename(deps.rootDir);
					const what = done === 1 ? basename(copyable[0]!) : `${done} items`;
					const left = [...refused, ...failed];
					if (left.length > 0) return deps.say(`Copied ${what} — left ${left.join(', ')}`, 'warn');
					deps.say(`Copied ${what} to ${where}/`);
				})(),
		);
	};
	const takeForPaste = (mode: 'cut' | 'copy') => {
		const targets = actionTargets();
		if (targets.length === 0) return deps.say('Nothing selected', 'warn');
		deps.setClipboard({ paths: targets, mode });
		deps.setMarked([]);
		deps.setAnchor(null);
		const what = targets.length === 1 ? basename(targets[0]!) : `${targets.length} items`;
		const verb = mode === 'cut' ? 'Cut' : 'Copied';
		deps.say(`${verb} ${what} — press p on the folder to ${mode === 'cut' ? 'move' : 'copy'} into`);
	};
	const copyPath = (path: string, kind: 'absolute' | 'relative') => {
		const rel = relative(deps.rootDir, path);
		const outside = rel === '..' || rel.startsWith(`..${sep}`);
		const text = kind === 'relative' && !outside ? rel : path;
		copyToClipboard(text);
		deps.renderer.copyToClipboardOSC52(text);
		if (kind === 'relative' && outside)
			return deps.say(`Copied ${text} — outside the project`, 'warn');
		deps.say(`Copied ${text}`);
	};
	const paste = () => {
		const { paths, mode } = deps.clipboard();
		if (paths.length === 0)
			return deps.say('Nothing taken — press x or c on a file or folder first', 'warn');
		const from = paths.filter((path) => exists(path));
		if (mode === 'cut') deps.setClipboard({ paths: [], mode: 'cut' });
		if (from.length === 0) return deps.say(`What was ${mode} is gone`, 'warn');
		if (mode === 'cut') moveAllInto(from, targetDir());
		else copyAllInto(from, targetDir());
	};
	const closeTab = (path: string, discardUnsaved = false) => {
		if (!discardUnsaved && deps.buffers[path]?.dirty) {
			return deps.setPrompt({ kind: 'closeDirty', paths: [path], names: [basename(path)] });
		}
		const idx = deps.tabs().indexOf(path);
		const next = deps.tabs().filter((p) => p !== path);
		deps.setTabs(next);
		if (deps.activePath() === path) {
			const fallback = next[idx] ?? next[idx - 1] ?? null;
			deps.setActivePath(fallback);
			if (!fallback && deps.sidebar()) deps.focusTree();
		}
		if (deps.previewPath() === path) deps.setPreviewPath(null);
		deps.discardBuffer(path);
		deps.setRecentlyClosed((prev) => [...prev.filter((p) => p !== path), path]);
	};
	const reopenTab = () => {
		const stack = [...deps.recentlyClosed()];
		while (stack.length > 0) {
			const path = stack.pop()!;
			if (exists(path)) {
				deps.setRecentlyClosed(() => stack);
				return deps.openFile(path);
			}
		}
		deps.setRecentlyClosed(() => []);
		deps.say('No closed tab to reopen', 'warn');
	};
	const closeTabs = (paths: string[], done: string) => {
		const dirty = paths.filter((path) => deps.buffers[path]?.dirty);
		if (dirty.length > 0) {
			return deps.setPrompt({
				kind: 'closeDirty',
				paths,
				names: dirty.map((path) => basename(path)),
			});
		}
		for (const path of paths) closeTab(path, true);
		deps.say(done);
	};
	const switchTab = (delta: number) => {
		const list = deps.tabs();
		if (list.length === 0) return;
		const idx = deps.activePath() ? list.indexOf(deps.activePath()!) : 0;
		deps.openFile(list[(idx + delta + list.length) % list.length]!);
	};
	const activateNode = (node: TreeNode) => {
		deps.setSelectedPath(node.path);
		if (node.isDir) deps.toggleExpand(node.path);
		else deps.openFile(node.path, true);
	};
	return {
		actionTargets,
		activateNode,
		closeTab,
		closeTabs,
		copyPath,
		movePath,
		paste,
		reopenTab,
		selectedNode,
		switchTab,
		takeForPaste,
		targetDir,
	};
}
