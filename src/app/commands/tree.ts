import type { Accessor, Setter } from 'solid-js';

import type { Config } from '../../core/config';
import type { TreeNode } from '../../core/fs';
import type { AppearancePluginLoad } from '../../core/localThemes';
import type { ThemeName } from '../../themes';
import { createAppCommands } from '../appCommands';
import { summarizeAppearancePlugins } from '../appearance/reload';
import type { Command } from '../commands';
import type { Navigation } from '../navigation';
import type {
	BufferState,
	Focus,
	HistoryRequest,
	LineOpRequest,
	PickerState,
	Prompt,
} from '../types';

export function createAppCommandTree(deps: {
	config: Config;
	buffers: Record<string, BufferState>;
	activePath: Accessor<string | null>;
	cursor: Accessor<{ line: number; col: number }>;
	setPicker: Setter<PickerState>;
	setPrompt: Setter<Prompt>;
	setHistory: Setter<HistoryRequest>;
	setSearch: Setter<{ scope: 'file' | 'project'; replacing?: boolean } | null>;
	setLineOp: Setter<LineOpRequest>;
	setHelp: Setter<boolean>;
	patchConfig: (patch: Partial<Config>, scope?: 'user' | 'project') => void;
	saveActive: () => void;
	targetDir: () => string;
	tabs: Accessor<string[]>;
	closeTabs: (paths: string[], done: string) => void;
	actionTargets: () => string[];
	takeForPaste: (mode: 'cut' | 'copy') => void;
	paste: () => void;
	closeTab: (path: string) => void;
	reopenTab: () => void;
	switchTab: (delta: number) => void;
	focus: Accessor<Focus>;
	setFocus: Setter<Focus>;
	focusTree: () => void;
	toggleSidebar: () => void;
	collapseSidebar: () => void;
	toggleMarkdown: () => void;
	controls: {
		withNode: (run: (node: TreeNode) => void) => () => void;
		applyVim: (enabled: boolean) => void;
		applyTabSize: (size: number) => void;
		applyTheme: (name: ThemeName) => void;
		previewTheme: (name: ThemeName) => void;
		cancelThemePreview: () => void;
		toggleDotfiles: () => void;
		toggleGitignored: () => void;
		toggleTrim: () => void;
		toggleFormat: () => void;
		toggleAutoSave: () => void;
		toggleTransparent: () => void;
	};
	openFile: (path: string) => void;
	navigation: Navigation;
	problemUi: {
		list: () => void;
		next: (direction: 1 | -1) => void;
	};
	lspRestart: () => boolean;
	openLspStatus: () => void;
	completion: { show: () => void; goToDefinition: () => void };
	gitCommands: Parameters<typeof createAppCommands>[0]['gitCommands'];
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
	quit: () => void;
	openSettings: () => void;
	openProjectSettings: () => void;
	reloadAppearancePlugins: () => void;
	appearanceVersion: () => AppearancePluginLoad;
}): Accessor<Command[]> {
	return createAppCommands({
		config: deps.config,
		saveActive: deps.saveActive,
		setPicker: (kind) => deps.setPicker(kind),
		activePath: deps.activePath,
		activeLine: () =>
			deps.buffers[deps.activePath()!]?.content.split('\n')[deps.cursor().line] ?? null,
		cursor: deps.cursor,
		openResolvedFile: deps.openFile,
		navigation: deps.navigation,
		tabs: deps.tabs,
		closeTabs: deps.closeTabs,
		setPrompt: deps.setPrompt,
		setHistory: deps.setHistory,
		setSearch: deps.setSearch,
		targetDir: deps.targetDir,
		withNode: deps.controls.withNode,
		actionTargets: deps.actionTargets,
		say: deps.say,
		takeForPaste: deps.takeForPaste,
		paste: deps.paste,
		closeTab: deps.closeTab,
		reopenTab: deps.reopenTab,
		switchTab: deps.switchTab,
		focus: deps.focus,
		setFocus: deps.setFocus,
		focusTree: deps.focusTree,
		toggleSidebar: deps.toggleSidebar,
		collapseSidebar: deps.collapseSidebar,
		toggleMarkdown: deps.toggleMarkdown,
		applyVim: deps.controls.applyVim,
		applyTabSize: deps.controls.applyTabSize,
		applyTheme: deps.controls.applyTheme,
		previewTheme: deps.controls.previewTheme,
		cancelThemePreview: deps.controls.cancelThemePreview,
		toggleDotfiles: deps.controls.toggleDotfiles,
		toggleGitignored: deps.controls.toggleGitignored,
		toggleTrim: deps.controls.toggleTrim,
		toggleFormat: deps.controls.toggleFormat,
		toggleAutoSave: deps.controls.toggleAutoSave,
		toggleTransparent: deps.controls.toggleTransparent,
		openSettings: deps.openSettings,
		openProjectSettings: deps.openProjectSettings,
		listAppearancePlugins: () => deps.say(summarizeAppearancePlugins(deps.appearanceVersion())),
		reloadAppearancePlugins: deps.reloadAppearancePlugins,
		appearanceVersion: deps.appearanceVersion,
		problemsList: deps.problemUi.list,
		problemsNext: () => deps.problemUi.next(1),
		problemsPrev: () => deps.problemUi.next(-1),
		problemsRestart: () =>
			deps.say(deps.lspRestart() ? 'Restarted language servers' : 'No language servers running'),
		lspStatus: deps.openLspStatus,
		completion: {
			show: deps.completion.show,
			goToDefinition: () => {
				deps.navigation.mark();
				void deps.completion.goToDefinition();
			},
		},
		setLineOp: deps.setLineOp,
		patchConfig: deps.patchConfig,
		gitCommands: deps.gitCommands,
		setHelp: deps.setHelp,
		quit: deps.quit,
	});
}
