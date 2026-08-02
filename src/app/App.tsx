import { useRenderer, useTerminalDimensions } from '@opentui/solid';
import { createMemo, createSignal } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { resolvedTheme, type Config } from '../core/config';
import { flattenVisible } from '../core/fs';
import { currentBranch, type FileStatus, type LineChange, type Upstream } from '../core/git';
import { invalidateSyntaxStyle } from '../languages/highlight';
import { setTheme } from '../themes';
import type { VimMode } from '../editor/vim';
import { createAppControls } from './appControls';
import { AppView } from './AppView';
import { createAppearancePluginUi } from './appearance/pluginsPage';
import { reloadAppearancePlugins as reloadPlugins } from './appearance/reload';
import { prepareStartup } from './appearance/startup';
import { createAppCommandTree } from './commands/tree';
import { READY } from './constants';
import { createDocumentActions } from './documentActions';
import { createFileActions } from './fileActions';
import { createGitCommands } from './gitCommands';
import { useAppKeyboard } from './keyboard';
import { startupOpen, useAppLifecycle } from './lifecycle';
import { createAppLsp, problemFrom, wireAppLspEffects } from './lsp/index';
import { createCompletionActions } from './lsp/completionActions';
import { createProblemUi } from './lsp/view';
import { createMarkdownView } from './markdown/view';
import { createNavigation } from './navigation';
import { createFileOpener } from './openFile';
import { openPathUnderCursor as openPathUnderCursorAction } from './openPathUnderCursor';
import { createOverlayOpen } from './overlayState';
import { createAppRuntime, selectedSingleLineText } from './runtime';
import { createReplacementHandlers } from './searchReplace';
import { createAppSettingRows } from './settings/view';
import { createSidebarSizing } from './sidebarSizing';
import { createTreeSelection } from './treeSelection';
import { hiddenTreeNodes } from './treeVisibility';
import type * as AppTypes from './types';
export function App(props: AppTypes.AppProps) {
	const renderer = useRenderer();
	const dimensions = useTerminalDimensions();
	const startup = prepareStartup(props);
	const { rootDir, restored, pluginStatus, initialConfig, initialAppearance } = startup;
	const [appearancePlugins, setAppearancePlugins] = createSignal(startup.appearancePlugins);
	const [userConfig, setUserConfig] = createStore<Config>({ ...props.initialConfig });
	const [projectConfig, setProjectConfig] = createStore<Partial<Config>>(props.projectConfig ?? {});
	const [config, setConfig] = createStore<Config>(initialConfig);
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
	const [lspStatusOpen, setLspStatusOpen] = createSignal(false);
	const [appearance, setAppearance] = createSignal<'dark' | 'light' | null>(initialAppearance);
	const [vimMode, setVimMode] = createSignal<VimMode | null>(initialConfig.vim ? 'normal' : null);
	const [reloadKey, setReloadKey] = createSignal(0);
	const [conflict, setConflict] = createSignal<AppTypes.Conflict | null>(null);
	const [search, setSearch] = createSignal<AppTypes.SearchState>(null);
	const [problemsOpen, setProblemsOpen] = createSignal(false);
	const [picker, setPicker] = createSignal<AppTypes.PickerState>(null);
	const [clipboard, setClipboard] = createSignal({ paths: [] as string[], mode: 'cut' as const });
	const cut = () => (clipboard().mode === 'cut' ? clipboard().paths : []);
	const [update, setUpdate] = createSignal<{ current: string; latest: string } | null>(null);
	const [gitLines, setGitLines] = createSignal<Map<number, LineChange>>(new Map());
	const [gitRevision, setGitRevision] = createSignal(0);
	const [gitStatus, setGitStatus] = createSignal<Map<string, FileStatus>>(new Map());
	const [gitIgnored, setGitIgnored] = createSignal<Set<string>>(new Set());
	const [branch, setBranch] = createSignal(currentBranch(rootDir));
	const [diffBase, setDiffBase] = createSignal<string | null>(null);
	const [upstream, setUpstream] = createSignal<Upstream | null>(null);
	const [resizing, setResizing] = createSignal(false);
	const [history, setHistory] = createSignal<AppTypes.HistoryRequest>(null);
	const [goto, setGoto] = createSignal<AppTypes.GotoRequest>(null);
	const [edit, setEdit] = createSignal<AppTypes.EditRequest>(null);
	const [lineOp, setLineOp] = createSignal<AppTypes.LineOpRequest>(null);
	const [recentlyClosed, setRecentlyClosed] = createSignal<string[]>([]);
	const [cursor, setCursor] = createSignal({ line: 0, col: 0 });
	const [busy, setBusy] = createSignal<AppTypes.BusyState>(null);
	const [status, setStatus] = createSignal<AppTypes.StatusMessage>(
		pluginStatus ?? { msg: READY, tone: 'info' },
	);
	const nodes = createMemo(() =>
		flattenVisible(rootDir, expanded(), hiddenTreeNodes(rootDir, config)),
	);
	const activeBuffer = () => (activePath() ? buffers[activePath()!] : undefined);
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
	const reloadUi = () => reloadPlugins({ rootDir, config, setAppearancePlugins, say });
	const appearancePluginUi = createAppearancePluginUi({
		config,
		appearance: appearancePlugins,
		patchConfig: (patch) => patchConfig(patch, settingsPage() ?? 'user'),
		editRegistry: () =>
			setPrompt({ kind: 'appearancePluginRegistry', current: config.pluginRegistry }),
		reload: reloadUi,
		say,
	});
	const { renderedMarkdownPath, toggleMarkdown } = createMarkdownView({
		activePath,
		renderedMarkdown,
		setRenderedMarkdown,
		setFocus,
		say,
	});
	const lsp = createAppLsp({ rootDir, config, say, setPrompt });
	wireAppLspEffects({ lsp, config, tabs, buffers });
	const expand = (path: string) => setExpanded((prev) => new Set(prev).add(path));
	const discardBuffer = (path: string) => setBuffers(produce((draft) => void delete draft[path]));
	const toggleExpand = (path: string) =>
		setExpanded((prev) => {
			const next = new Set(prev);
			if (!next.delete(path)) next.add(path);
			return next;
		});
	const saveDirtyPathsRef = { run: (_paths: string[]) => {} };
	const { collapseAll, extendSelection, focusTree, moveSelection, reveal, toggleSidebar } =
		createTreeSelection({
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
	const jumpTo = (match: { path: string | null; line: number; col: number }) => {
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
	const completion = createCompletionActions(
		activePath,
		config,
		cursor,
		lsp,
		openFile,
		setFocus,
		setGoto,
		say,
	);
	const navigation = createNavigation({ activePath, cursor, openFile, setFocus, setGoto, say });
	const goToDefinition = () => {
		navigation.mark();
		void completion.goToDefinition();
	};
	const openPathUnderCursor = () => {
		openPathUnderCursorAction({
			activePath,
			activeLine: () => {
				const path = activePath();
				return path ? (buffers[path]?.content.split('\n')[cursor().line] ?? null) : null;
			},
			cursorCol: () => cursor().col,
			rootDir: targetDir,
			openResolvedFile: openFile,
			markNavigation: navigation.mark,
			goToDefinition: () => void completion.goToDefinition(),
			say,
		});
	};
	const gitCommands = createGitCommands({
		rootDir,
		branch,
		diffBase,
		upstream,
		setDiffBase,
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
		installLspServer: lsp.install,
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
		appearancePluginsOpen: appearancePluginUi.open,
		lspStatusOpen,
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
	const settingRows = createAppSettingRows({
		config,
		iconThemes: () => appearancePlugins().iconThemes,
		controls,
		patchConfig,
		configScope: () => settingsPage() ?? 'user',
	});
	const commands = createAppCommandTree({
		config,
		buffers,
		saveActive,
		setPicker,
		activePath,
		cursor,
		openFile,
		navigation,
		tabs,
		closeTabs,
		setPrompt,
		setHistory,
		setSearch,
		targetDir,
		actionTargets,
		takeForPaste,
		paste,
		closeTab,
		reopenTab,
		switchTab,
		focus,
		setFocus,
		focusTree,
		toggleSidebar,
		collapseSidebar: () => say(collapseAll() ? 'Collapsed sidebar folders' : 'No folders expanded'),
		toggleMarkdown,
		controls,
		openSettings: () => setSettingsPage('user'),
		openProjectSettings: () => setSettingsPage('project'),
		openAppearancePlugins: appearancePluginUi.show,
		reloadAppearancePlugins: reloadUi,
		appearanceVersion: () => appearancePlugins(),
		problemUi,
		lspRestart: lsp.restart,
		openLspStatus: () => setLspStatusOpen(true),
		completion,
		setLineOp,
		patchConfig,
		gitCommands,
		setHelp,
		say,
		quit,
	});
	useAppLifecycle({
		rootDir,
		...startupOpen(props),
		initialConfig: props.initialConfig,
		checkUpdates: props.checkUpdates,
		appearanceVersion: () => appearancePlugins(),
		restoredFailed: restored.failed,
		activeBuffer,
		activePath,
		expanded,
		nodes,
		gitRevision,
		diffBase,
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
		dependenciesChanged: lsp.dependenciesChanged,
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
		focus: () => (gitCommands.panel() ? 'gitPanel' : focus()),
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
		navigateBack: navigation.back,
		navigateForward: navigation.forward,
		openPathUnderCursor,
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
		goToDefinition,
		problemsList: problemUi.list,
		problemsNext: () => problemUi.next(1),
		problemsPrev: () => problemUi.next(-1),
		problemsRestart: () =>
			say(lsp.restart() ? 'Restarted language servers' : 'No language servers running'),
		completion: completion.show,
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
		<>
			<AppView
				rootDir={rootDir}
				config={config}
				iconThemes={appearancePlugins().iconThemes}
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
				completion={completion.request()}
				gitLines={gitLines()}
				problems={problemUi.lines()}
				problemCounts={problemUi.counts()}
				problemChoices={problemUi.choices()}
				problemsOpen={problemsOpen()}
				lspStatusRows={lsp.statusRows()}
				lspStatusOpen={lspStatusOpen()}
				notice={notice()}
				blocked={overlay()}
				status={status()}
				cursor={cursor()}
				vimMode={vimMode()}
				branch={branch()}
				diffBase={diffBase()}
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
				diffTitle={gitCommands.diffTitle()}
				commands={commands()}
				settingRows={settingRows()}
				commitFiles={gitCommands.commitFiles()}
				branchChoices={gitCommands.branchChoices()}
				branchChoiceTitle={gitCommands.branchChoiceTitle()}
				branchChoiceMessage={gitCommands.branchChoiceMessage()}
				conflict={conflict()}
				update={update()}
				peek={peek()}
				help={help()}
				selection={selectedSingleLineText(renderer)}
				canNavigateBack={navigation.canBack()}
				canNavigateForward={navigation.canForward()}
				onSelectTab={openFile}
				onCloseTab={closeTab}
				onNavigateBack={navigation.back}
				onNavigateForward={navigation.forward}
				onOverflowTabs={() => setPicker('tabs')}
				onResizeDrag={(event) => resizing() && resizeSidebar(event.x)}
				onResizeEnd={() => setResizing(false)}
				onActivateNode={activateNode}
				onPinNode={(node) => pinTab(node.path)}
				onTreeFocus={() => setFocus('tree')}
				onGitDiff={gitCommands.openDiff}
				onGitCommit={gitCommands.openCommitPicker}
				onGitPush={gitCommands.push}
				onGitBranchAction={gitCommands.openPanelBranchAction}
				onResizeStart={(event) => {
					setResizing(true);
					resizeSidebar(event.x);
				}}
				onEditorChange={onEditorChange}
				onCursor={setCursor}
				onEditorFocus={() => setFocus('editor')}
				onVimMode={setVimMode}
				onToggleMarkdown={toggleMarkdown}
				onComplete={completion.complete}
				onResolveCompletion={completion.resolve}
				onQuit={quit}
				onSubmitPrompt={(value) => {
					if (prompt()?.kind === 'gotoLine') navigation.mark();
					submitPrompt(value);
				}}
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
				onPickProblem={problemUi.pick}
				onCloseProblems={() => setProblemsOpen(false)}
				onCloseLspStatus={() => setLspStatusOpen(false)}
				onCloseDiff={gitCommands.closeDiff}
				onCommitFiles={gitCommands.startCommit}
				onCancelCommit={gitCommands.cancelCommit}
				onPickBranch={gitCommands.pickBranch}
				onCloseBranchChoices={gitCommands.closeBranchChoices}
				onResolveConflict={resolveConflict}
				onCancelConflict={() => setConflict(null)}
				onCloseUpdate={() => setUpdate(null)}
				onSkipUpdate={() => {
					const info = update();
					if (info) patchConfig({ skipUpdate: info.latest });
					setUpdate(null);
				}}
			/>
			{appearancePluginUi.view()}
		</>
	);
}
