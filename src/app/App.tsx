import { basename, join } from 'node:path';
import type { MouseEvent } from '@opentui/core';
import { useRenderer, useTerminalDimensions } from '@opentui/solid';
import { createMemo, createSignal } from 'solid-js';
import { createStore, produce, unwrap } from 'solid-js/store';
import { saveConfig, sidebarColumns, SIDEBAR_MIN, SIDEBAR_MAX } from '../core/config';
import type { Config } from '../core/config';
import type { TreeNode } from '../core/fs';
import { BinaryFileError, flattenVisible, mtimeOf, readFile } from '../core/fs';
import { currentBranch } from '../core/git';
import type { FileStatus, LineChange, Upstream } from '../core/git';
import type { Match } from '../core/search';
import { checkForUpdate } from '../core/update';
import type { VimMode } from '../editor/vim';
import type { SearchScope } from '../ui/SearchPanel';
import type { Tone } from '../ui/StatusBar';
import { createAppCommands } from './appCommands';
import { createAppControls } from './appControls';
import { AppView } from './AppView';
import { EDITOR_MIN, READY } from './constants';
import { createDocumentActions } from './documentActions';
import { createFileActions } from './fileActions';
import { createGitCommands } from './gitCommands';
import { useAppKeyboard } from './keyboard';
import { useAppLifecycle } from './lifecycle';
import { restoreAppState } from './restore';
import { createReplacementHandlers } from './searchReplace';
import type { BufferState, Conflict, Focus, Prompt } from './types';
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
	let saveDirtyPaths = (_paths: string[]) => {};
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
		const leaving = activePath();
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
		if (config.autoSaveOnBlur && leaving && leaving !== path && buffers[leaving]?.dirty) {
			saveDirtyPaths([leaving]);
		}
		setFocus('editor');
	};
	const pinTab = (path: string) => {
		if (previewPath() === path) setPreviewPath(null);
	};
	const fileActions = createFileActions({
		rootDir, buffers, nodes, tabs, activePath, previewPath, recentlyClosed, clipboard, marked,
		selectedPath, sidebar, setBuffers, setTabs, setActivePath, setPreviewPath, setSelectedPath,
		setExpanded, setMarked, setAnchor, setClipboard, setRecentlyClosed, setPrompt, setBusy,
		say, whileFree, refreshTree, expand, discardBuffer, focusTree, openFile, toggleExpand,
	});
	const { actionTargets, activateNode, closeTab, closeTabs, movePath, paste, reopenTab, selectedNode, switchTab, takeForPaste, targetDir } = fileActions;
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
	const gitCommands = createGitCommands({
		rootDir, branch, upstream, setBusy, setGitRevision, setPrompt, say, whileFree,
		syncFromDisk: () => documentActions.syncFromDisk(),
	});
	const documentActions = createDocumentActions({
		config, buffers, activePath, activeBuffer, prompt, conflict, nodes, tabs, selectedPath,
		gitCommands, closeTab, expand, movePath, openFile, pinTab, quit, refreshTree, say,
		setAnchor, setBuffers, setBusy, setConflict, setFocus, setGitRevision, setGoto,
		setMarked, setPrompt, setReloadKey, setSelectedPath, pushEdit, whileFree,
	});
	saveDirtyPaths = documentActions.saveDirtyPaths;
	const { onEditorChange, resolveConflict, saveActive, saveDirtyOnBlur, submitPrompt, confirmPrompt, syncFromDisk } = documentActions;
	const overlay = createMemo(() => !!(prompt() || palette() || conflict() || help() || search() || update() || picker() || gitCommands.commitFiles()));
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
	const { applyTabSize, applyTheme, applyVim, confirmation, promptTitle, promptValue, withNode } =
		createAppControls({ config, prompt, selectedNode, setVimMode, patchConfig, say });
	const commands = createAppCommands({
		config,
		saveActive,
		setPicker,
		activePath,
		tabs,
		closeTabs,
		setPrompt,
		setHistory,
		setSearch,
		targetDir,
		withNode,
		actionTargets,
		say,
		takeForPaste,
		paste,
		closeTab,
		reopenTab,
		switchTab,
		focus,
		setFocus,
		focusTree,
		toggleSidebar,
		applyVim,
		applyTabSize,
		applyTheme,
		setLineOp,
		patchConfig,
		gitCommands,
		setHelp,
		quit,
	});
	useAppLifecycle({
		rootDir, single, openLine: props.openLine, initialConfig: props.initialConfig,
		checkUpdates: props.checkUpdates, restoredFailed: restored.failed, activeBuffer, activePath,
		expanded, gitRevision, reloadKey, sidebar, tabs, branch, config, renderer, saveDirtyOnBlur,
		syncFromDisk, say, setGitRevision, setGitLines, setGitStatus, setBranch, setUpstream,
		setGoto, setNotice, setUpdate, status,
	});
	useAppKeyboard({
		config, activePath, clipboard, focus, help, marked, notice, overlay, peek, selectedNode,
		sidebar, vimMode, activateNode, actionTargets, closeTab, extendSelection, focusTree,
		moveSelection, nudgeSidebar, paste, quit, reopenTab, saveActive, say, setAnchor,
		setClipboard, setFocus, setHelp, setMarked, setNotice, setPalette, setPeek, setPicker,
		setPrompt, setSearch, setSelectedPath, switchTab, takeForPaste, targetDir, toggleExpand,
		toggleSidebar, expanded,
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
			commitFiles={gitCommands.commitFiles()}
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
			onCommitFiles={gitCommands.startCommit}
			onCancelCommit={gitCommands.cancelCommit}
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
