import type { MouseEvent } from '@opentui/core';
import { useRenderer, useTerminalDimensions } from '@opentui/solid';
import { createMemo, createSignal, onCleanup } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { detectAppearance } from '../core/appearance';
import { resolveConfig, resolvedTheme } from '../core/config';
import type { Config } from '../core/config';
import type { TreeNode } from '../core/fs';
import { flattenVisible } from '../core/fs';
import { currentBranch } from '../core/git';
import { invalidateSyntaxStyle } from '../languages/highlight';
import type { FileStatus, LineChange, Upstream } from '../core/git';
import { isMarkdownPath } from '../core/markdown';
import type { Match } from '../core/search';
import { checkForUpdate } from '../core/update';
import type { VimMode } from '../editor/vim';
import { setTheme, setTransparency } from '../themes';
import { createAppCommands } from './appCommands';
import { createAppControls } from './appControls';
import { AppView } from './AppView';
import { READY } from './constants';
import { createDocumentActions } from './documentActions';
import { createFileActions } from './fileActions';
import { createGitCommands } from './gitCommands';
import { useAppKeyboard } from './keyboard';
import { useAppLifecycle } from './lifecycle';
import { createAppLsp, problemFrom, wireAppLspEffects } from './lsp/index';
import { createProblemUi } from './lsp/view';
import { createFileOpener } from './openFile';
import { createOverlayOpen } from './overlayState';
import { restoreAppState } from './restore';
import { createAppRuntime, selectedSingleLineText } from './runtime';
import { createReplacementHandlers } from './searchReplace';
import { createSettingsRows } from './settingsRows';
import { createSidebarSizing } from './sidebarSizing';
import { createTreeSelection } from './treeSelection';
import { hiddenTreeNodes } from './treeVisibility';
import type * as AppTypes from './types';
export function App(props: AppTypes.AppProps) {
	const renderer = useRenderer();
	const dimensions = useTerminalDimensions();
	const rootDir = props.rootDir;
	const single = props.openFile ?? null;
	const restored = restoreAppState(rootDir, single);
	const initialProjectConfig = props.projectConfig ?? {};
	const initialConfig = resolveConfig(props.initialConfig, initialProjectConfig);
	const initialAppearance = detectAppearance();
	initialConfig.theme = resolvedTheme(initialConfig, initialAppearance);
	const [userConfig, setUserConfig] = createStore<Config>({ ...props.initialConfig });
	const [projectConfig, setProjectConfig] = createStore<Partial<Config>>({
		...initialProjectConfig,
	});
	const [config, setConfig] = createStore<Config>(initialConfig);
	setTheme(initialConfig.theme);
	setTransparency(initialConfig.transparent);
	const [buffers, setBuffers] = createStore<Record<string, AppTypes.BufferState>>(restored.buffers);
	const [expanded, setExpanded] = createSignal<Set<string>>(new Set(restored.expanded));
	const [selectedPath, setSelectedPath] = createSignal<string | null>(restored.activePath);
	const [marked, setMarked] = createSignal<string[]>([]);
	const [anchor, setAnchor] = createSignal<string | null>(null);
	const [notice, setNotice] = createSignal<{ name: string; reason: string } | null>(null);
	const [tabs, setTabs] = createSignal<string[]>(restored.tabs);
	const [activePath, setActivePath] = createSignal<string | null>(restored.activePath);
	const [previewPath, setPreviewPath] = createSignal<string | null>(null);
	const [renderedMarkdown, setRenderedMarkdown] = createSignal<string[]>([]);
	const [sidebar, setSidebar] = createSignal(restored.sidebar);
	const [focus, setFocus] = createSignal<AppTypes.Focus>(restored.sidebar ? 'tree' : 'editor');
	const [prompt, setPrompt] = createSignal<AppTypes.Prompt>(null);
	const [help, setHelp] = createSignal(false);
	const [peek, setPeek] = createSignal(false);
	const [palette, setPalette] = createSignal(false);
	const [settingsPage, setSettingsPage] = createSignal<'user' | 'project' | null>(null);
	const [appearance, setAppearance] = createSignal<'dark' | 'light' | null>(initialAppearance);
	const [vimMode, setVimMode] = createSignal<VimMode | null>(initialConfig.vim ? 'normal' : null);
	const [reloadKey, setReloadKey] = createSignal(0);
	const [conflict, setConflict] = createSignal<AppTypes.Conflict | null>(null);
	const [search, setSearch] = createSignal<AppTypes.SearchState>(null);
	const [problemsOpen, setProblemsOpen] = createSignal(false);
	const selection = () => selectedSingleLineText(renderer);
	const [picker, setPicker] = createSignal<AppTypes.PickerState>(null);
	const [clipboard, setClipboard] = createSignal({ paths: [] as string[], mode: 'cut' as const });
	const cut = () => (clipboard().mode === 'cut' ? clipboard().paths : []);
	const [update, setUpdate] = createSignal(null as Awaited<ReturnType<typeof checkForUpdate>>);
	const [gitLines, setGitLines] = createSignal<Map<number, LineChange>>(new Map());
	const [gitRevision, setGitRevision] = createSignal(0);
	const [gitStatus, setGitStatus] = createSignal<Map<string, FileStatus>>(new Map());
	const [gitIgnored, setGitIgnored] = createSignal<Set<string>>(new Set());
	const [branch, setBranch] = createSignal(currentBranch(rootDir));
	const [upstream, setUpstream] = createSignal<Upstream | null>(null);
	const [resizing, setResizing] = createSignal(false);
	const [history, setHistory] = createSignal<AppTypes.HistoryRequest>(null);
	const [goto, setGoto] = createSignal<AppTypes.GotoRequest>(null);
	const [edit, setEdit] = createSignal<AppTypes.EditRequest>(null);
	const [lineOp, setLineOp] = createSignal<AppTypes.LineOpRequest>(null);
	const [recentlyClosed, setRecentlyClosed] = createSignal<string[]>([]);
	const [cursor, setCursor] = createSignal({ line: 0, col: 0 });
	const [busy, setBusy] = createSignal<AppTypes.BusyState>(null);
	const [status, setStatus] = createSignal<AppTypes.StatusMessage>({ msg: READY, tone: 'info' });
	const nodes = createMemo(() =>
		flattenVisible(rootDir, expanded(), hiddenTreeNodes(rootDir, config)),
	);
	const activeBuffer = () => (activePath() ? buffers[activePath()!] : undefined);
	const renderedMarkdownPath = () => {
		const path = activePath();
		return path && renderedMarkdown().includes(path) && isMarkdownPath(path) ? path : null;
	};
	const toggleMarkdown = () => {
		const path = activePath();
		if (!path || !isMarkdownPath(path)) return say('Not a markdown file', 'warn');
		const rendered = !renderedMarkdown().includes(path);
		setRenderedMarkdown((prev) => (rendered ? [...prev, path] : prev.filter((p) => p !== path)));
		setFocus('editor');
		say(rendered ? `Rendering ${path.slice(path.lastIndexOf('/') + 1)}` : 'Markdown source');
	};
	const { patchConfig, quit, say, whileFree } = createAppRuntime({
		buffers,
		busy,
		rootDir,
		userConfig,
		projectConfig,
		config,
		renderer,
		setConfig,
		setUserConfig,
		setProjectConfig,
		setPrompt,
		setStatus,
	});
	const refreshTree = () => setExpanded((prev) => new Set(prev));
	const lsp = createAppLsp({ rootDir, config, say });
	onCleanup(lsp.dispose);
	wireAppLspEffects({
		lsp,
		config,
		tabs,
		buffers,
	});
	const expand = (path: string) => setExpanded((prev) => new Set(prev).add(path));
	const discardBuffer = (path: string) => setBuffers(produce((draft) => void delete draft[path]));
	const toggleExpand = (path: string) =>
		setExpanded((prev) => {
			const next = new Set(prev);
			if (!next.delete(path)) next.add(path);
			return next;
		});
	const saveDirtyPathsRef = { run: (_paths: string[]) => {} };
	const { extendSelection, focusTree, moveSelection, reveal, toggleSidebar } = createTreeSelection({
		rootDir,
		nodes,
		sidebar,
		selectedPath,
		anchor,
		setExpanded,
		setSelectedPath,
		setMarked,
		setAnchor,
		setSidebar,
		setFocus,
	});
	const { openFile, pinTab } = createFileOpener({
		activePath,
		buffers,
		config,
		discardBuffer,
		previewPath,
		reveal,
		saveDirtyPathsRef,
		setActivePath,
		setBuffers,
		setFocus,
		setNotice,
		setPreviewPath,
		setSelectedPath,
		setTabs,
	});
	const fileActions = createFileActions({
		rootDir,
		buffers,
		nodes,
		tabs,
		activePath,
		previewPath,
		recentlyClosed,
		clipboard,
		marked,
		selectedPath,
		sidebar,
		setBuffers,
		setTabs,
		setActivePath,
		setPreviewPath,
		setSelectedPath,
		setExpanded,
		setMarked,
		setAnchor,
		setClipboard,
		setRecentlyClosed,
		setPrompt,
		setBusy,
		say,
		whileFree,
		refreshTree,
		expand,
		discardBuffer,
		focusTree,
		openFile,
		toggleExpand,
	});
	const {
		actionTargets,
		activateNode,
		closeTab,
		closeTabs,
		movePath,
		paste,
		reopenTab,
		selectedNode,
		switchTab,
		takeForPaste,
		targetDir,
	} = fileActions;
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
	const problemUi = createProblemUi({
		rootDir,
		problems: lsp.problems,
		tabs,
		activePath,
		cursor,
		problemsOpen,
		setProblemsOpen,
		setGoto,
		setFocus,
		openFile,
		say,
		nextFrom: problemFrom,
	});
	const gitCommands = createGitCommands({
		rootDir,
		branch,
		upstream,
		setBusy,
		setGitRevision,
		setPrompt,
		say,
		whileFree,
		syncFromDisk: () => documentActions.syncFromDisk(),
	});
	const documentActions = createDocumentActions({
		config,
		buffers,
		activePath,
		activeBuffer,
		prompt,
		conflict,
		nodes,
		tabs,
		selectedPath,
		gitCommands,
		closeTab,
		expand,
		movePath,
		openFile,
		pinTab,
		quit,
		refreshTree,
		say,
		setAnchor,
		setBuffers,
		setBusy,
		setConflict,
		setFocus,
		setGitRevision,
		setGoto,
		setMarked,
		setPrompt,
		setReloadKey,
		setSelectedPath,
		pushEdit,
		patchConfig: (patch) => patchConfig(patch, settingsPage() ?? 'user'),
		whileFree,
		rootDir,
	});
	saveDirtyPathsRef.run = documentActions.saveDirtyPaths;
	const {
		onEditorChange,
		resolveConflict,
		saveActive,
		saveDirtyOnBlur,
		submitPrompt,
		confirmPrompt,
		syncFromDisk,
	} = documentActions;
	const overlay = createOverlayOpen({
		prompt,
		palette,
		conflict,
		help,
		search,
		settingsPage: () => settingsPage() !== null,
		diff: gitCommands.diff,
		update,
		picker,
		problemsOpen,
		commitFiles: gitCommands.commitFiles,
	});
	const { nudgeSidebar, resizeSidebar, treeWidth } = createSidebarSizing({
		config,
		width: () => dimensions().width,
		patchConfig,
	});
	const controls = createAppControls({
		config,
		configScope: () => settingsPage() ?? 'user',
		currentAppearance: appearance,
		prompt,
		selectedNode,
		setVimMode,
		setPrompt,
		patchConfig,
		say,
	});
	const settingRows = createSettingsRows({
		config,
		applyTheme: controls.applyTheme,
		applyTabSize: controls.applyTabSize,
		applyVim: controls.applyVim,
		editFormatter: controls.editFormatter,
		editKeybinding: controls.editKeybinding,
		editSidebarWidth: controls.editSidebarWidth,
		toggleAutoSave: controls.toggleAutoSave,
		toggleFormat: controls.toggleFormat,
		toggleThemeSync: controls.toggleThemeSync,
		toggleTransparent: controls.toggleTransparent,
		toggleDotfiles: controls.toggleDotfiles,
		toggleGitignored: controls.toggleGitignored,
		toggleTrim: controls.toggleTrim,
		patchConfig,
		configScope: () => settingsPage() ?? 'user',
	});
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
		withNode: controls.withNode,
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
		toggleMarkdown,
		applyVim: controls.applyVim,
		applyTabSize: controls.applyTabSize,
		applyTheme: controls.applyTheme,
		toggleDotfiles: controls.toggleDotfiles,
		toggleGitignored: controls.toggleGitignored,
		toggleTrim: controls.toggleTrim,
		toggleFormat: controls.toggleFormat,
		toggleAutoSave: controls.toggleAutoSave,
		toggleTransparent: controls.toggleTransparent,
		openSettings: () => setSettingsPage('user'),
		openProjectSettings: () => setSettingsPage('project'),
		problemsList: problemUi.list,
		problemsNext: () => problemUi.next(1),
		problemsPrev: () => problemUi.next(-1),
		setLineOp,
		patchConfig,
		gitCommands,
		setHelp,
		quit,
	});
	useAppLifecycle({
		rootDir,
		single,
		openLine: props.openLine,
		initialConfig: props.initialConfig,
		checkUpdates: props.checkUpdates,
		restoredFailed: restored.failed,
		activeBuffer,
		activePath,
		expanded,
		nodes,
		gitRevision,
		reloadKey,
		sidebar,
		tabs,
		branch,
		config,
		renderer,
		onAppearance: (next) => {
			setAppearance(next);
			if (!config.themeSync) return;
			const theme = resolvedTheme(config, next);
			setTheme(theme);
			invalidateSyntaxStyle();
			setConfig('theme', theme);
		},
		saveDirtyOnBlur,
		syncFromDisk,
		say,
		setGitRevision,
		setGitLines,
		setGitStatus,
		setGitIgnored,
		setBranch,
		setUpstream,
		setGoto,
		setNotice,
		setUpdate,
		status,
	});
	useAppKeyboard({
		config,
		activePath,
		clipboard,
		focus,
		help,
		marked,
		notice,
		overlay,
		peek,
		selectedNode,
		sidebar,
		vimMode,
		activateNode,
		actionTargets,
		closeTab,
		extendSelection,
		focusTree,
		moveSelection,
		nudgeSidebar,
		paste,
		quit,
		reopenTab,
		saveActive,
		say,
		setAnchor,
		setClipboard,
		setFocus,
		setHelp,
		setMarked,
		setNotice,
		setPalette,
		setPeek,
		setPicker,
		setPrompt,
		setSearch,
		setSelectedPath,
		switchTab,
		takeForPaste,
		targetDir,
		toggleExpand,
		toggleSidebar,
		toggleGitPanel: gitCommands.togglePanel,
		toggleMarkdown,
		problemsList: problemUi.list,
		problemsNext: () => problemUi.next(1),
		problemsPrev: () => problemUi.next(-1),
		expanded,
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
			renderedMarkdownPath={renderedMarkdownPath()}
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
			gitIgnored={gitIgnored()}
			cutPaths={cut()}
			markedPaths={marked()}
			resizing={resizing()}
			reloadKey={reloadKey()}
			goto={goto()}
			history={history()}
			edit={edit()}
			lineOp={lineOp()}
			gitLines={gitLines()}
			problems={problemUi.lines()}
			problemCounts={problemUi.counts()}
			problemChoices={problemUi.choices()}
			problemsOpen={problemsOpen()}
			notice={notice()}
			blocked={overlay()}
			status={status()}
			cursor={cursor()}
			vimMode={vimMode()}
			branch={branch()}
			upstream={upstream()}
			busy={busy()}
			promptTitle={controls.promptTitle()}
			promptValue={controls.promptValue()}
			confirmation={controls.confirmation()}
			search={search()}
			picker={picker()}
			gitPanel={gitCommands.panel()}
			palette={palette()}
			settingsPage={settingsPage() !== null}
			settingsScope={settingsPage() ?? 'user'}
			diff={gitCommands.diff()}
			commands={commands()}
			settingRows={settingRows()}
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
			onGitDiff={gitCommands.openDiff}
			onGitCommit={gitCommands.openCommitPicker}
			onGitPush={gitCommands.push}
			onResizeStart={(event: MouseEvent) => {
				setResizing(true);
				resizeSidebar(event.x);
			}}
			onEditorChange={onEditorChange}
			onCursor={setCursor}
			onEditorFocus={() => setFocus('editor')}
			onVimMode={setVimMode}
			onToggleMarkdown={toggleMarkdown}
			onQuit={quit}
			onSubmitPrompt={submitPrompt}
			onCancelPrompt={() => setPrompt(null)}
			onConfirmPrompt={confirmPrompt}
			onPickSearch={jumpTo}
			onReplaceOne={replaceOne}
			onReplaceAll={replaceEvery}
			onCloseSearch={() => setSearch(null)}
			onPickFile={(path: string) => void (setPicker(null), openFile(path))}
			onClosePicker={() => setPicker(null)}
			onClosePalette={() => setPalette(false)}
			onCloseSettings={() => setSettingsPage(null)}
			onPickProblem={(id: string) => {
				problemUi.pick(id);
			}}
			onCloseProblems={() => setProblemsOpen(false)}
			onCloseDiff={gitCommands.closeDiff}
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
