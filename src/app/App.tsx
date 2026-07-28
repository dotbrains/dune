import { basename, dirname, join, relative } from 'node:path';
import type { KeyEvent, MouseEvent } from '@opentui/core';
import { useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/solid';
import { createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js';
import { createStore, produce, unwrap } from 'solid-js/store';
import { copyAll, moveAll, removeAll } from '../core/bulk';
import { saveConfig, sidebarColumns, SIDEBAR_MIN, SIDEBAR_MAX } from '../core/config';
import type { Config } from '../core/config';
import type { TreeNode } from '../core/fs';
import {
	BinaryFileError,
	createDir,
	createFile,
	exists,
	freePath,
	flattenVisible,
	mtimeOf,
	readFile,
	rename,
	watchTree,
	writeFile,
} from '../core/fs';
import { currentBranch, diffLines, statusMap, upstreamOf } from '../core/git';
import type { FileStatus, LineChange, Upstream } from '../core/git';
import type { Match } from '../core/search';
import { saveSession } from '../core/session';
import { checkForUpdate } from '../core/update';
import { trimTrailing } from '../editor/lines';
import type { VimMode } from '../editor/vim';
import { invalidateSyntaxStyle } from '../languages/highlight';
import { setTheme, themeLabels } from '../themes';
import type { ThemeName } from '../themes';
import type { SearchScope } from '../ui/SearchPanel';
import type { Tone } from '../ui/StatusBar';
import { AppView } from './AppView';
import { clashWarning } from './clashes';
import { buildCommands } from './commands';
import { CLASH_CHANGED, CLASH_DELETED, EDITOR_MIN, READY } from './constants';
import { confirmationForPrompt } from './confirmation';
import { within } from './pathRules';
import { promptTitleFor, isTextPrompt } from './prompts';
import { restoreAppState } from './restore';
import { createReplacementHandlers } from './searchReplace';
import type { BufferState, Conflict, DiskSync, Focus, Prompt } from './types';
const chord = (key: KeyEvent) => key.shift || key.option || key.meta;
export function App(props: {
	rootDir: string;
	openFile?: string | null;
	openLine?: number | null;
	initialConfig: Config;
	checkUpdates?: boolean;
}) {
	const renderer = useRenderer();
	const dimensions = useTerminalDimensions();
	const rootDir = props.rootDir;
	const single = props.openFile ?? null;
	const restored = restoreAppState(rootDir, single);
	const [config, setConfig] = createStore<Config>({ ...props.initialConfig });
	const [buffers, setBuffers] = createStore<Record<string, BufferState>>(restored.buffers);
	const [expanded, setExpanded] = createSignal<Set<string>>(new Set(restored.expanded));
	const [selectedPath, setSelectedPath] = createSignal<string | null>(restored.activePath);
	const [marked, setMarked] = createSignal<string[]>([]);
	const [anchor, setAnchor] = createSignal<string | null>(null);
	const [notice, setNotice] = createSignal<{ name: string; reason: string } | null>(null);
	const [tabs, setTabs] = createSignal<string[]>(restored.tabs);
	const [activePath, setActivePath] = createSignal<string | null>(restored.activePath);
	const [previewPath, setPreviewPath] = createSignal<string | null>(null);
	const [sidebar, setSidebar] = createSignal(restored.sidebar);
	const [focus, setFocus] = createSignal<Focus>(restored.sidebar ? 'tree' : 'editor');
	const [prompt, setPrompt] = createSignal<Prompt>(null);
	const [help, setHelp] = createSignal(false);
	const [peek, setPeek] = createSignal(false);
	const [palette, setPalette] = createSignal(false);
	const [vimMode, setVimMode] = createSignal<VimMode | null>(
		props.initialConfig.vim ? 'normal' : null,
	);
	const [reloadKey, setReloadKey] = createSignal(0);
	const [conflict, setConflict] = createSignal<Conflict | null>(null);
	const [search, setSearch] = createSignal<{ scope: SearchScope; replacing?: boolean } | null>(
		null,
	);
	const selection = () => {
		const text = renderer.getSelection()?.getSelectedText() ?? '';
		return text.includes('\n') ? '' : text;
	};
	const [picker, setPicker] = createSignal<'files' | 'tabs' | null>(null);
	const [clipboard, setClipboard] = createSignal<{ paths: string[]; mode: 'cut' | 'copy' }>({
		paths: [],
		mode: 'cut',
	});
	const cut = () => (clipboard().mode === 'cut' ? clipboard().paths : []);
	const [update, setUpdate] = createSignal(null as Awaited<ReturnType<typeof checkForUpdate>>);
	const [gitLines, setGitLines] = createSignal<Map<number, LineChange>>(new Map());
	const [gitRevision, setGitRevision] = createSignal(0);
	const [gitStatus, setGitStatus] = createSignal<Map<string, FileStatus>>(new Map());
	const [branch, setBranch] = createSignal(currentBranch(rootDir));
	const [upstream, setUpstream] = createSignal<Upstream | null>(null);
	const [resizing, setResizing] = createSignal(false);
	const [history, setHistory] = createSignal<{ kind: 'undo' | 'redo'; key: number } | null>(null);
	const [goto, setGoto] = createSignal<{ line: number; col: number; key: number } | null>(null);
	const [edit, setEdit] = createSignal<{ content: string; key: number } | null>(null);
	const [lineOp, setLineOp] = createSignal<{
		op: 'comment' | 'up' | 'down' | 'duplicate';
		key: number;
	} | null>(null);
	const [recentlyClosed, setRecentlyClosed] = createSignal<string[]>([]);
	const [cursor, setCursor] = createSignal({ line: 0, col: 0 });
	const [busy, setBusy] = createSignal<{ label: string; done: number; total: number } | null>(null);
	const [status, setStatus] = createSignal<{ msg: string; tone: Tone }>({
		msg: READY,
		tone: 'info',
	});
	const nodes = createMemo(() => flattenVisible(rootDir, expanded()));
	const activeBuffer = () => {
		const path = activePath();
		return path ? buffers[path] : undefined;
	};
	const overlay = createMemo(
		() => !!(prompt() || palette() || conflict() || help() || search() || update() || picker()),
	);
	const dirtyPaths = () => Object.keys(unwrap(buffers)).filter((path) => buffers[path]?.dirty);
	const quit = (discardUnsaved = false) => {
		const dirty = dirtyPaths();
		if (!discardUnsaved && dirty.length > 0) {
			return setPrompt({ kind: 'quitDirty', names: dirty.map((path) => basename(path)) });
		}
		renderer.destroy();
		process.exit(0);
	};
	const say = (msg: string, tone: Tone = 'info') => setStatus({ msg, tone });
	const whileFree = (run: () => void) => {
		const running = busy();
		if (running) return say(`${running.label} already — let it finish`, 'warn');
		run();
	};
	const refreshTree = () => setExpanded((prev) => new Set(prev));
	const expand = (path: string) => setExpanded((prev) => new Set(prev).add(path));
	const discardBuffer = (path: string) => setBuffers(produce((draft) => void delete draft[path]));
	const patchConfig = (patch: Partial<Config>) => {
		setConfig(patch);
		saveConfig(unwrap(config));
	};
	const toggleExpand = (path: string) =>
		setExpanded((prev) => {
			const next = new Set(prev);
			if (!next.delete(path)) next.add(path);
			return next;
		});
	const reveal = (path: string) => {
		const parts = path.startsWith(rootDir) ? path.slice(rootDir.length + 1).split('/') : [];
		if (parts.length < 2) return;
		setExpanded((prev) => {
			const next = new Set(prev);
			let dir = rootDir;
			for (const part of parts.slice(0, -1)) {
				dir = join(dir, part);
				next.add(dir);
			}
			return next.size === prev.size ? prev : next;
		});
	};
	const focusTree = () => {
		const path = selectedPath();
		if (path) reveal(path);
		if (!nodes().some((n) => n.path === selectedPath())) setSelectedPath(nodes()[0]?.path ?? null);
		setFocus('tree');
	};
	const moveSelection = (delta: number) => {
		const rows = nodes();
		if (rows.length === 0) return;
		const idx = rows.findIndex((n) => n.path === selectedPath());
		const next = idx < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, idx + delta));
		setSelectedPath(rows[next]!.path);
		setMarked([]);
		setAnchor(null);
	};
	const extendSelection = (delta: number) => {
		const rows = nodes();
		const head = rows.findIndex((n) => n.path === selectedPath());
		if (rows.length === 0 || head < 0) return moveSelection(delta);
		const from = anchor() ?? rows[head]!.path;
		if (!anchor()) setAnchor(from);
		const start = rows.findIndex((n) => n.path === from);
		const next = Math.max(0, Math.min(rows.length - 1, head + delta));
		const [lo, hi] = start <= next ? [start, next] : [next, start];
		setMarked(rows.slice(lo, hi + 1).map((n) => n.path));
		setSelectedPath(rows[next]!.path);
	};
	const actionTargets = (): string[] => {
		const all = marked();
		if (all.length > 0) return all;
		const path = selectedPath();
		return path ? [path] : [];
	};
	const toggleSidebar = () => {
		if (sidebar()) {
			setSidebar(false);
			setFocus('editor');
			return;
		}
		setSidebar(true);
		focusTree();
	};
	const openFile = (path: string, preview = false) => {
		setNotice(null);
		if (!buffers[path]) {
			try {
				setBuffers(path, { content: readFile(path), dirty: false, mtime: mtimeOf(path) });
			} catch (e) {
				setNotice({
					name: basename(path),
					reason:
						e instanceof BinaryFileError
							? 'It is binary, or uses an encoding dune cannot read.'
							: (e as Error).message,
				});
				return;
			}
		}
		setTabs((prev) => {
			if (prev.includes(path)) return prev;
			const slot = previewPath() ? prev.indexOf(previewPath()!) : -1;
			if (preview && slot >= 0) return prev.map((p, i) => (i === slot ? path : p));
			return [...prev, path];
		});
		if (preview) {
			const previous = previewPath();
			if (previous && previous !== path) discardBuffer(previous);
			setPreviewPath(path);
		} else if (previewPath() === path) {
			setPreviewPath(null);
		}
		reveal(path);
		setSelectedPath(path);
		setActivePath(path);
		setFocus('editor');
	};
	const pinTab = (path: string) => {
		if (previewPath() === path) setPreviewPath(null);
	};
	const adoptMove = (from: string, to: string) => {
		const inside = `${from}/`;
		const remap = (path: string) =>
			path === from ? to : path.startsWith(inside) ? to + path.slice(from.length) : path;
		setTabs((prev) => prev.map(remap));
		for (const path of Object.keys(unwrap(buffers))) {
			const next = remap(path);
			if (next === path) continue;
			setBuffers(next, { ...buffers[path]! });
			discardBuffer(path);
		}
		const active = activePath();
		if (active) setActivePath(remap(active));
		const preview = previewPath();
		if (preview) setPreviewPath(remap(preview));
		setSelectedPath(to);
		setExpanded((prev) => new Set([...prev].map(remap)));
	};
	const movePath = (from: string, to: string): string | null => {
		const err = rename(from, to);
		if (err) return err;
		adoptMove(from, to);
		return null;
	};
	const whyNotMove = (path: string, dir: string): string | null => {
		if (dirname(path) === dir) return `${basename(path)} is already there`;
		if (within(dir, path)) return `Cannot move ${basename(path)} into itself`;
		return null;
	};
	const moveInto = (path: string, dir: string) => {
		const refused = whyNotMove(path, dir);
		if (refused) return say(refused, 'warn');
		const err = movePath(path, join(dir, basename(path)));
		if (err) return say(err, 'error');
		expand(dir);
		say(`Moved ${basename(path)} to ${relative(rootDir, dir) || basename(rootDir)}/`);
	};
	const moveAllInto = (paths: string[], dir: string) => {
		if (paths.length === 1) return moveInto(paths[0]!, dir);
		const refused: string[] = [];
		const movable = paths.filter((path) => {
			if (!whyNotMove(path, dir)) return true;
			refused.push(basename(path));
			return false;
		});
		setMarked([]);
		setAnchor(null);
		whileFree(
			() =>
				void (async () => {
					setBusy({ label: 'Moving', done: 0, total: movable.length });
					const { done, failed, moved } = await moveAll(
						movable,
						dir,
						(into, base) => join(into, base),
						(progress) => setBusy({ label: 'Moving', done: progress.done, total: progress.total }),
					);
					setBusy(null);
					for (const { from, to } of moved) adoptMove(from, to);
					if (done > 0) expand(dir);
					refreshTree();
					const where = relative(rootDir, dir) || basename(rootDir);
					const left = [...refused, ...failed];
					if (left.length === 0) return say(`Moved ${done} items to ${where}/`);
					say(`Moved ${done} to ${where}/ — left ${left.join(', ')}`, 'warn');
				})(),
		);
	};
	const activateNode = (node: TreeNode) => {
		setSelectedPath(node.path);
		if (node.isDir) toggleExpand(node.path);
		else openFile(node.path, true);
	};
	const selectedNode = () => nodes().find((n) => n.path === selectedPath());
	const targetDir = () => {
		const node = selectedNode();
		if (!node) return rootDir;
		return node.isDir ? node.path : dirname(node.path);
	};
	const copyAllInto = (paths: string[], dir: string) => {
		const refused: string[] = [];
		const copyable = paths.filter((path) => {
			if (!within(dir, path)) return true;
			refused.push(basename(path));
			return false;
		});
		setMarked([]);
		setAnchor(null);
		if (copyable.length === 0) {
			return say(`Cannot copy ${refused.join(', ')} into itself`, 'warn');
		}
		whileFree(
			() =>
				void (async () => {
					setBusy({ label: 'Copying', done: 0, total: copyable.length });
					const { done, failed } = await copyAll(copyable, dir, freePath, (progress) =>
						setBusy({ label: 'Copying', done: progress.done, total: progress.total }),
					);
					setBusy(null);
					if (done === 0) return;
					expand(dir);
					refreshTree();
					const where = relative(rootDir, dir) || basename(rootDir);
					const what = done === 1 ? basename(copyable[0]!) : `${done} items`;
					const left = [...refused, ...failed];
					if (left.length > 0) return say(`Copied ${what} — left ${left.join(', ')}`, 'warn');
					say(`Copied ${what} to ${where}/`);
				})(),
		);
	};
	const takeForPaste = (mode: 'cut' | 'copy') => {
		const targets = actionTargets();
		if (targets.length === 0) return say('Nothing selected', 'warn');
		setClipboard({ paths: targets, mode });
		setMarked([]);
		setAnchor(null);
		const what = targets.length === 1 ? basename(targets[0]!) : `${targets.length} items`;
		const verb = mode === 'cut' ? 'Cut' : 'Copied';
		say(`${verb} ${what} — press p on the folder to ${mode === 'cut' ? 'move' : 'copy'} into`);
	};
	const paste = () => {
		const { paths, mode } = clipboard();
		if (paths.length === 0) {
			return say('Nothing taken — press x or c on a file or folder first', 'warn');
		}
		const from = paths.filter((path) => exists(path));
		if (mode === 'cut') setClipboard({ paths: [], mode: 'cut' });
		if (from.length === 0) return say(`What was ${mode} is gone`, 'warn');
		if (mode === 'cut') moveAllInto(from, targetDir());
		else copyAllInto(from, targetDir());
	};
	const closeTab = (path: string, discardUnsaved = false) => {
		if (!discardUnsaved && buffers[path]?.dirty) {
			return setPrompt({ kind: 'closeDirty', paths: [path], names: [basename(path)] });
		}
		const idx = tabs().indexOf(path);
		const next = tabs().filter((p) => p !== path);
		setTabs(next);
		if (activePath() === path) {
			const fallback = next[idx] ?? next[idx - 1] ?? null;
			setActivePath(fallback);
			if (!fallback && sidebar()) focusTree();
		}
		if (previewPath() === path) setPreviewPath(null);
		discardBuffer(path);
		setRecentlyClosed((prev) => [...prev.filter((p) => p !== path), path]);
	};
	const reopenTab = () => {
		const stack = [...recentlyClosed()];
		while (stack.length > 0) {
			const path = stack.pop()!;
			if (exists(path)) {
				setRecentlyClosed(stack);
				return openFile(path);
			}
		}
		setRecentlyClosed([]);
		say('No closed tab to reopen', 'warn');
	};
	const closeTabs = (paths: string[], done: string) => {
		const dirty = paths.filter((path) => buffers[path]?.dirty);
		if (dirty.length > 0) {
			return setPrompt({ kind: 'closeDirty', paths, names: dirty.map((path) => basename(path)) });
		}
		for (const path of paths) closeTab(path, true);
		say(done);
	};
	const switchTab = (delta: number) => {
		const list = tabs();
		if (list.length === 0) return;
		const idx = activePath() ? list.indexOf(activePath()!) : 0;
		openFile(list[(idx + delta + list.length) % list.length]!);
	};
	const pushEdit = (content: string) => setEdit((prev) => ({ content, key: (prev?.key ?? 0) + 1 }));
	const applyReplacement = (path: string, next: string) => {
		pinTab(path);
		setBuffers(path, { content: next, dirty: true });
		pushEdit(next);
	};
	const jumpTo = (match: Match) => {
		setSearch(null);
		if (match.path && match.path !== activePath()) openFile(match.path);
		setGoto((prev) => ({ line: match.line, col: match.col, key: (prev?.key ?? 0) + 1 }));
		setFocus('editor');
	};
	const writeBuffer = (path: string, content: string): boolean => {
		const final = config.trimOnSave ? trimTrailing(content) : content;
		const err = writeFile(path, final);
		if (err) {
			say(`Save failed: ${err}`, 'error');
			return false;
		}
		setBuffers(path, { content: final, dirty: false, mtime: mtimeOf(path) });
		if (final !== content && path === activePath()) pushEdit(final);
		setGitRevision((n) => n + 1);
		say(`Saved ${basename(path)}`);
		return true;
	};
	const saveActive = () => {
		const path = activePath();
		const buffer = activeBuffer();
		if (!path || !buffer) return;
		if (mtimeOf(path) !== buffer.mtime) {
			if (!exists(path)) {
				setConflict({ path, disk: '', deleted: true });
				return;
			}
			let disk = '';
			try {
				disk = readFile(path);
			} catch {}
			if (disk !== buffer.content) {
				setConflict({ path, disk, deleted: false });
				return;
			}
		}
		writeBuffer(path, buffer.content);
	};
	const saveDirtyOnBlur = () => {
		const skipped: string[] = [];
		const failed: string[] = [];
		let saved = 0;
		for (const path of Object.keys(buffers)) {
			const buffer = buffers[path]!;
			if (!buffer.dirty) continue;
			if (mtimeOf(path) !== buffer.mtime) {
				skipped.push(basename(path));
				continue;
			}
			if (writeBuffer(path, buffer.content)) saved++;
			else failed.push(basename(path));
		}
		if (saved > 1) say(`Saved ${saved} files`);
		if (skipped.length > 0) say(`${CLASH_CHANGED}${skipped.join(', ')}`, 'warn');
		if (failed.length > 0) say(`Save failed: ${failed.join(', ')}`, 'error');
	};
	const resolveConflict = (choice: string) => {
		const c = conflict();
		setConflict(null);
		if (!c) return;
		if (choice === 'overwrite' && buffers[c.path]) {
			writeBuffer(c.path, buffers[c.path]!.content);
		} else if (choice === 'reload') {
			setBuffers(c.path, { content: c.disk, dirty: false, mtime: mtimeOf(c.path) });
			setReloadKey((k) => k + 1);
			say(`Reloaded ${basename(c.path)} from disk`);
		}
	};
	const onEditorChange = (text: string) => {
		const path = activePath();
		if (!path || buffers[path]?.content === text) return;
		pinTab(path);
		setBuffers(path, { content: text, dirty: true });
	};
	const syncFromDisk = (): DiskSync => {
		const updates: [string, BufferState][] = [];
		const changed: string[] = [];
		const deleted: string[] = [];
		const vanished: string[] = [];
		for (const path of Object.keys(buffers)) {
			const buffer = buffers[path]!;
			if (!exists(path)) {
				if (buffer.dirty) deleted.push(basename(path));
				else vanished.push(path);
				continue;
			}
			let disk: string;
			try {
				disk = readFile(path);
			} catch {
				continue;
			}
			if (disk === buffer.content) continue;
			if (buffer.dirty) changed.push(basename(path));
			else updates.push([path, { content: disk, dirty: false, mtime: mtimeOf(path) }]);
		}
		for (const path of vanished) closeTab(path, true);
		if (updates.length > 0) {
			setBuffers(
				produce((draft) => {
					for (const [path, buffer] of updates) draft[path] = buffer;
				}),
			);
			setReloadKey((k) => k + 1);
		}
		refreshTree();
		return { changed, deleted };
	};
	const submitPrompt = (value: string) => {
		const name = value.trim();
		const p = prompt();
		setPrompt(null);
		if (!p || !isTextPrompt(p)) return;
		if (!name) return say('Nothing entered', 'warn');
		if (p.kind === 'gotoLine') {
			const asked = Number.parseInt(name, 10);
			if (!Number.isInteger(asked) || asked < 1) return say(`Not a line number: ${name}`, 'error');
			const total = activeBuffer()?.content.split('\n').length ?? 1;
			const line = Math.min(asked, total);
			setGoto((prev) => ({ line: line - 1, col: 0, key: (prev?.key ?? 0) + 1 }));
			setFocus('editor');
			say(line === asked ? `Line ${line}` : `Line ${line} — the file ends there`);
		} else if (p.kind === 'newFile') {
			const path = join(p.dir, name);
			const err = createFile(path);
			if (err) return say(err, 'error');
			expand(p.dir);
			openFile(path);
			say(`Created ${name}`);
		} else if (p.kind === 'newFolder') {
			const path = join(p.dir, name);
			const err = createDir(path);
			if (err) return say(err, 'error');
			expand(path);
			setSelectedPath(path);
			say(`Created ${name}/`);
		} else if (p.kind === 'rename') {
			const err = movePath(p.target, join(dirname(p.target), name));
			if (err) return say(err, 'error');
			say(`Renamed to ${name}`);
		}
	};
	const confirmPrompt = () => {
		const p = prompt();
		setPrompt(null);
		switch (p?.kind) {
			case 'delete': {
				for (const target of p.targets) {
					if (tabs().includes(target)) closeTab(target, true);
				}
				const gone = selectedPath();
				const wasAt =
					gone && p.targets.includes(gone) ? nodes().findIndex((n) => n.path === gone) : -1;
				setMarked([]);
				setAnchor(null);
				const targets = p.targets;
				whileFree(
					() =>
						void (async () => {
							setBusy({ label: 'Deleting', done: 0, total: 0 });
							const { failed } = await removeAll(targets, (progress) =>
								setBusy({ label: 'Deleting', done: progress.done, total: progress.total }),
							);
							setBusy(null);
							refreshTree();
							if (wasAt >= 0) {
								const rows = nodes();
								setSelectedPath(rows[Math.min(wasAt, rows.length - 1)]?.path ?? null);
							}
							if (failed.length > 0) return say(`Could not delete ${failed.join(', ')}`, 'error');
							say(
								targets.length === 1
									? `Deleted ${basename(targets[0]!)}`
									: `Deleted ${targets.length} items`,
							);
						})(),
				);
				return;
			}
			case 'closeDirty': {
				for (const path of p.paths) closeTab(path, true);
				return say(`Discarded unsaved edits in ${p.names.join(', ')}`, 'warn');
			}
			case 'quitDirty':
				return quit(true);
		}
	};
	const applyTheme = (name: ThemeName) => {
		setTheme(name);
		invalidateSyntaxStyle();
		patchConfig({ theme: name });
		say(`Theme: ${themeLabels[name]}`);
	};
	const treeWidth = () =>
		Math.max(
			0,
			Math.min(
				sidebarColumns(config.sidebarWidth, dimensions().width),
				dimensions().width - EDITOR_MIN,
			),
		);
	const resizeSidebar = (width: number) => {
		const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.round(width)));
		if (next !== config.sidebarWidth) patchConfig({ sidebarWidth: next });
	};
	const nudgeSidebar = (delta: number) => resizeSidebar(treeWidth() + delta);
	const applyTabSize = (size: number) => {
		patchConfig({ tabSize: size });
		say(`Tab size: ${size}`);
	};
	const applyVim = (enabled: boolean) => {
		setVimMode(enabled ? 'normal' : null);
		patchConfig({ vim: enabled });
		say(`Vim mode ${enabled ? 'on' : 'off'}`);
	};
	const withNode = (run: (node: TreeNode) => void) => () => {
		const node = selectedNode();
		if (node) run(node);
		else say('Select a file in the tree first', 'warn');
	};
	const promptTitle = () => {
		const p = prompt();
		return promptTitleFor(p);
	};
	const promptValue = () => {
		const p = prompt();
		return p?.kind === 'rename' ? basename(p.target) : '';
	};
	const confirmation = createMemo(() => confirmationForPrompt(prompt()));
	const commands = createMemo(() =>
		buildCommands(
			{
				save: saveActive,
				openFile: () => setPicker('files'),
				switchTab: () => setPicker('tabs'),
				closeOthers: () => {
					const keep = activePath();
					if (keep)
						closeTabs(
							tabs().filter((path) => path !== keep),
							'Closed other tabs',
						);
				},
				closeAll: () => closeTabs(tabs(), 'Closed all tabs'),
				gotoLine: () => setPrompt({ kind: 'gotoLine' }),
				undo: () => setHistory((prev) => ({ kind: 'undo', key: (prev?.key ?? 0) + 1 })),
				redo: () => setHistory((prev) => ({ kind: 'redo', key: (prev?.key ?? 0) + 1 })),
				findInFile: () => setSearch({ scope: 'file' }),
				findInProject: () => setSearch({ scope: 'project' }),
				replaceInFile: () => setSearch({ scope: 'file', replacing: true }),
				newFile: () => setPrompt({ kind: 'newFile', dir: targetDir() }),
				newFolder: () => setPrompt({ kind: 'newFolder', dir: targetDir() }),
				rename: withNode((n) => setPrompt({ kind: 'rename', target: n.path })),
				remove: () => {
					const targets = actionTargets();
					if (targets.length === 0) return say('Nothing selected', 'warn');
					setPrompt({ kind: 'delete', targets });
				},
				cutForMove: () => takeForPaste('cut'),
				copyForPaste: () => takeForPaste('copy'),
				paste,
				closeTab: () => void (activePath() && closeTab(activePath()!)),
				reopenTab,
				nextTab: () => switchTab(1),
				prevTab: () => switchTab(-1),
				toggleFocus: () => (focus() === 'tree' ? setFocus('editor') : focusTree()),
				toggleSidebar,
				setVim: applyVim,
				setTabSize: applyTabSize,
				setTheme: applyTheme,
				lineOp: (op) => setLineOp((prev) => ({ op, key: (prev?.key ?? 0) + 1 })),
				toggleTrim: () => {
					patchConfig({ trimOnSave: !config.trimOnSave });
					say(`Trim on save ${config.trimOnSave ? 'on' : 'off'}`);
				},
				toggleAutoSave: () => {
					patchConfig({ autoSaveOnBlur: !config.autoSaveOnBlur });
					say(`Auto-save on blur ${config.autoSaveOnBlur ? 'on' : 'off'}`);
				},
				showHelp: () => setHelp(true),
				quit,
			},
			{
				vimEnabled: config.vim,
				activeTheme: config.theme,
				tabSize: config.tabSize,
				trimOnSave: config.trimOnSave,
				autoSaveOnBlur: config.autoSaveOnBlur,
			},
		),
	);
	onMount(() => {
		if (restored.failed) setNotice({ name: basename(single!), reason: restored.failed });
		const line = props.openLine;
		const buffer = activeBuffer();
		if (line != null && buffer) {
			const total = buffer.content.split('\n').length;
			setGoto({ line: Math.min(line, total - 1), col: 0, key: 1 });
		}
	});
	onMount(() => {
		if (props.checkUpdates === false) return;
		let cancelled = false;
		onCleanup(() => {
			cancelled = true;
		});
		void (async () => {
			const info = await checkForUpdate();
			if (!cancelled && info && info.latest !== props.initialConfig.skipUpdate) setUpdate(info);
		})();
	});
	onMount(() => {
		if (process.stdout.isTTY) process.stdout.write('\x1B[?1004h');
		const onStdin = (chunk: BufferState | string) => {
			if (config.autoSaveOnBlur && chunk.toString().includes('\x1B[O')) saveDirtyOnBlur();
		};
		renderer.stdin.on('data', onStdin);
		onCleanup(() => {
			renderer.stdin.off('data', onStdin);
			if (process.stdout.isTTY) process.stdout.write('\x1B[?1004l');
		});
	});
	onMount(() =>
		onCleanup(
			watchTree(rootDir, (changed) => {
				if (changed.git) setGitRevision((n) => n + 1);
				if (!changed.tree) return;
				const warning = clashWarning(syncFromDisk());
				if (warning) {
					say(warning, 'warn');
				} else if (
					status().msg.startsWith(CLASH_CHANGED) ||
					status().msg.startsWith(CLASH_DELETED)
				) {
					say(READY);
				}
			}),
		),
	);
	createEffect(
		on(
			() => [activePath(), reloadKey(), gitRevision()] as const,
			([path]) => {
				setGitLines(path ? diffLines(path) : new Map());
			},
		),
	);
	createEffect(
		on(
			() => [branch(), gitRevision()] as const,
			() => setUpstream(upstreamOf(rootDir)),
		),
	);
	createEffect(
		on(
			() => [expanded(), gitRevision(), reloadKey()] as const,
			() => {
				setGitStatus(statusMap(rootDir));
				setBranch(currentBranch(rootDir));
			},
		),
	);
	createEffect(
		on(
			() => [tabs(), activePath(), expanded(), sidebar()] as const,
			([openTabs, active, folders, showTree]) => {
				if (single) return;
				saveSession(rootDir, {
					tabs: openTabs,
					activePath: active,
					expanded: [...folders],
					sidebar: showTree,
				});
			},
		),
	);
	useKeyboard((key: KeyEvent) => {
		const k = key.name;
		if (help()) {
			if (k === 'escape') setHelp(false);
			return;
		}
		if (overlay()) return;
		if (notice()) setNotice(null);
		const claim = (run: () => void) => {
			key.preventDefault();
			run();
		};
		if (key.ctrl && k === 'k') return claim(() => setPeek((p) => !p));
		if (peek()) setPeek(false);
		if (key.ctrl && k === 'q') return claim(quit);
		if (key.ctrl && k === 'c' && focus() !== 'editor') return claim(quit);
		if (key.ctrl && k === 'p') return claim(() => setPalette(true));
		if (key.ctrl && k === 'o') return claim(() => setPicker('files'));
		if (key.ctrl && chord(key) && k === 't') return claim(reopenTab);
		if (key.ctrl && (k === 't' || k === 'up')) return claim(() => setPicker('tabs'));
		if (key.ctrl && k === 'g') return claim(() => setPrompt({ kind: 'gotoLine' }));
		if (key.ctrl && k === 's') return claim(saveActive);
		const vimOwnsRedo = config.vim && focus() === 'editor' && vimMode() !== 'insert';
		if (key.ctrl && k === 'r' && !vimOwnsRedo) return claim(() => setSearch({ scope: 'project' }));
		if (key.ctrl && chord(key) && k === 'f') return claim(() => setSearch({ scope: 'project' }));
		if (key.ctrl && k === 'f') return claim(() => setSearch({ scope: 'file' }));
		if (key.ctrl && k === 'w') {
			return claim(() => void (activePath() && closeTab(activePath()!)));
		}
		if (key.ctrl && chord(key) && k === 'n') {
			return claim(() => setPrompt({ kind: 'newFolder', dir: targetDir() }));
		}
		if (key.ctrl && k === 'n') return claim(() => setPrompt({ kind: 'newFile', dir: targetDir() }));
		if (key.ctrl && k === 'b') return claim(toggleSidebar);
		if (key.ctrl && (k === 'pageup' || k === 'left')) return claim(() => switchTab(-1));
		if (key.ctrl && (k === 'pagedown' || k === 'right')) return claim(() => switchTab(1));
		if (focus() === 'editor') {
			const vimOwnsEscape = config.vim && vimMode() !== 'normal';
			if (k === 'escape' && sidebar() && !vimOwnsEscape) focusTree();
			return;
		}
		if (key.ctrl || key.meta || key.option) return;
		key.preventDefault();
		const node = selectedNode();
		switch (k) {
			case 'tab':
				if (activePath()) setFocus('editor');
				break;
			case 'up':
				if (key.shift) extendSelection(-1);
				else moveSelection(-1);
				break;
			case 'down':
				if (key.shift) extendSelection(1);
				else moveSelection(1);
				break;
			case 'right':
				if (node?.isDir && !expanded().has(node.path)) toggleExpand(node.path);
				else moveSelection(1);
				break;
			case 'left':
				if (node?.isDir && expanded().has(node.path)) toggleExpand(node.path);
				else if (node) setSelectedPath(dirname(node.path));
				break;
			case 'return':
			case 'enter':
				if (node) activateNode(node);
				break;
			case '[':
				nudgeSidebar(-2);
				break;
			case ']':
				nudgeSidebar(2);
				break;
			case 'a':
				setPrompt({ kind: key.shift ? 'newFolder' : 'newFile', dir: targetDir() });
				break;
			case 'r':
				if (node) setPrompt({ kind: 'rename', target: node.path });
				break;
			case 'x':
				takeForPaste('cut');
				break;
			case 'c':
				takeForPaste('copy');
				break;
			case 'p':
				paste();
				break;
			case 'escape':
				if (clipboard().paths.length > 0) {
					const cancelled = clipboard().mode === 'cut' ? 'Move' : 'Copy';
					setClipboard({ paths: [], mode: 'cut' });
					say(`${cancelled} cancelled`);
				} else if (marked().length > 0) {
					setMarked([]);
					setAnchor(null);
				}
				break;
			case 'd':
			case 'delete':
			case 'backspace': {
				const targets = actionTargets();
				if (targets.length > 0) setPrompt({ kind: 'delete', targets });
				break;
			}
		}
	});
	const { replaceOne, replaceEvery } = createReplacementHandlers({
		activePath,
		buffer: (path) => buffers[path],
		closeSearch: () => setSearch(null),
		applyReplacement,
		say,
	});
	return (
		<AppView
			rootDir={rootDir}
			config={config}
			tabs={tabs()}
			activePath={activePath()}
			activeBuffer={activeBuffer()}
			buffers={buffers}
			previewPath={previewPath()}
			sidebar={sidebar()}
			nodes={nodes()}
			selectedPath={selectedPath()}
			expanded={expanded()}
			focus={focus()}
			treeWidth={treeWidth()}
			gitStatus={gitStatus()}
			cutPaths={cut()}
			markedPaths={marked()}
			resizing={resizing()}
			reloadKey={reloadKey()}
			goto={goto()}
			history={history()}
			edit={edit()}
			lineOp={lineOp()}
			gitLines={gitLines()}
			notice={notice()}
			blocked={overlay()}
			status={status()}
			cursor={cursor()}
			vimMode={vimMode()}
			branch={branch()}
			upstream={upstream()}
			busy={busy()}
			promptTitle={promptTitle()}
			promptValue={promptValue()}
			confirmation={confirmation()}
			search={search()}
			picker={picker()}
			palette={palette()}
			commands={commands()}
			conflict={conflict()}
			update={update()}
			peek={peek()}
			help={help()}
			selection={selection()}
			onSelectTab={(path: string) => openFile(path)}
			onCloseTab={closeTab}
			onOverflowTabs={() => setPicker('tabs')}
			onResizeDrag={(event: MouseEvent) => {
				if (resizing()) resizeSidebar(event.x);
			}}
			onResizeEnd={() => setResizing(false)}
			onActivateNode={activateNode}
			onPinNode={(node: TreeNode) => pinTab(node.path)}
			onTreeFocus={() => setFocus('tree')}
			onResizeStart={(event: MouseEvent) => {
				setResizing(true);
				resizeSidebar(event.x);
			}}
			onEditorChange={onEditorChange}
			onCursor={setCursor}
			onEditorFocus={() => setFocus('editor')}
			onVimMode={setVimMode}
			onQuit={quit}
			onSubmitPrompt={submitPrompt}
			onCancelPrompt={() => setPrompt(null)}
			onConfirmPrompt={confirmPrompt}
			onPickSearch={jumpTo}
			onReplaceOne={replaceOne}
			onReplaceAll={replaceEvery}
			onCloseSearch={() => setSearch(null)}
			onPickFile={(path: string) => {
				setPicker(null);
				openFile(path);
			}}
			onClosePicker={() => setPicker(null)}
			onClosePalette={() => setPalette(false)}
			onResolveConflict={resolveConflict}
			onCancelConflict={() => setConflict(null)}
			onCloseUpdate={() => setUpdate(null)}
			onSkipUpdate={() => {
				const info = update();
				if (info) patchConfig({ skipUpdate: info.latest });
				setUpdate(null);
			}}
		/>
	);
}
