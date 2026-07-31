import { dirname } from 'node:path';

import { createMemo } from 'solid-js';

import type { Config } from '../core/config';
import { pathTokenAt, resolvePathToken } from '../core/pathTarget';
import type { TreeNode } from '../core/fs';
import type { ThemeName } from '../themes';
import { buildCommands } from './commands';
import type { Focus, Prompt } from './types';

export function createAppCommands(deps: {
	config: Config;
	saveActive: () => void;
	setPicker: (kind: 'files' | 'tabs') => void;
	activePath: () => string | null;
	activeLine: () => string | null;
	cursor: () => { line: number; col: number };
	openResolvedFile: (path: string) => void;
	tabs: () => string[];
	closeTabs: (paths: string[], done: string) => void;
	setPrompt: (prompt: Prompt) => void;
	setHistory: (
		update: (prev: { kind: 'undo' | 'redo'; key: number } | null) => {
			kind: 'undo' | 'redo';
			key: number;
		},
	) => void;
	setSearch: (search: { scope: 'file' | 'project'; replacing?: boolean }) => void;
	targetDir: () => string;
	withNode: (run: (node: TreeNode) => void) => () => void;
	actionTargets: () => string[];
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
	takeForPaste: (mode: 'cut' | 'copy') => void;
	paste: () => void;
	closeTab: (path: string) => void;
	reopenTab: () => void;
	switchTab: (delta: number) => void;
	focus: () => Focus;
	setFocus: (focus: Focus) => void;
	focusTree: () => void;
	toggleSidebar: () => void;
	applyVim: (enabled: boolean) => void;
	applyTabSize: (size: number) => void;
	applyTheme: (name: ThemeName) => void;
	toggleMarkdown: () => void;
	toggleDotfiles: () => void;
	toggleGitignored: () => void;
	toggleTrim: () => void;
	toggleFormat: () => void;
	toggleAutoSave: () => void;
	toggleTransparent: () => void;
	problemsList: () => void;
	problemsNext: () => void;
	problemsPrev: () => void;
	completion: { show: () => void; goToDefinition: () => void };
	openSettings: () => void;
	openProjectSettings: () => void;
	setLineOp: (
		update: (prev: { op: 'comment' | 'up' | 'down' | 'duplicate'; key: number } | null) => {
			op: 'comment' | 'up' | 'down' | 'duplicate';
			key: number;
		},
	) => void;
	patchConfig: (patch: Partial<Config>) => void;
	gitCommands: {
		openCommitPicker: () => void;
		togglePanel: () => void;
		openDiff: (path?: string | null) => void;
		openBranchComparison: () => void;
		openBranchCommitComparison: () => void;
		openDiffBasePicker: () => void;
		resetDiffBase: () => void;
		openBranchSwitch: () => void;
		openBranchPrompt: () => void;
		openBranchFrom: () => void;
		openBranchMerge: () => void;
		openBranchRename: () => void;
		openBranchDelete: () => void;
		openBranchForceDelete: () => void;
		confirmUndoCommit: () => void;
		stash: () => void;
		stashPop: () => void;
		fetch: () => void;
		pull: () => void;
		push: () => void;
	};
	setHelp: (show: boolean) => void;
	quit: () => void;
}) {
	return createMemo(() =>
		buildCommands(
			{
				save: deps.saveActive,
				openFile: () => deps.setPicker('files'),
				openPathUnderCursor: () => {
					const path = deps.activePath();
					const line = deps.activeLine();
					if (!path || line === null) return deps.say('Open a file first', 'warn');
					const token = pathTokenAt(line, deps.cursor().col);
					if (!token) return deps.say('No file path under cursor', 'warn');
					const target = resolvePathToken(token, dirname(path), deps.targetDir());
					if (!target) return deps.say(`Cannot find ${token}`, 'warn');
					deps.openResolvedFile(target);
				},
				switchTab: () => deps.setPicker('tabs'),
				closeOthers: () => {
					const keep = deps.activePath();
					if (keep)
						deps.closeTabs(
							deps.tabs().filter((path) => path !== keep),
							'Closed other tabs',
						);
				},
				closeAll: () => deps.closeTabs(deps.tabs(), 'Closed all tabs'),
				gotoLine: () => deps.setPrompt({ kind: 'gotoLine' }),
				undo: () => deps.setHistory((prev) => ({ kind: 'undo', key: (prev?.key ?? 0) + 1 })),
				redo: () => deps.setHistory((prev) => ({ kind: 'redo', key: (prev?.key ?? 0) + 1 })),
				findInFile: () => deps.setSearch({ scope: 'file' }),
				findInProject: () => deps.setSearch({ scope: 'project' }),
				replaceInFile: () => deps.setSearch({ scope: 'file', replacing: true }),
				newFile: () => deps.setPrompt({ kind: 'newFile', dir: deps.targetDir() }),
				newFolder: () => deps.setPrompt({ kind: 'newFolder', dir: deps.targetDir() }),
				rename: deps.withNode((n) => deps.setPrompt({ kind: 'rename', target: n.path })),
				remove: () => {
					const targets = deps.actionTargets();
					if (targets.length === 0) return deps.say('Nothing selected', 'warn');
					deps.setPrompt({ kind: 'delete', targets });
				},
				cutForMove: () => deps.takeForPaste('cut'),
				copyForPaste: () => deps.takeForPaste('copy'),
				paste: deps.paste,
				closeTab: () => void (deps.activePath() && deps.closeTab(deps.activePath()!)),
				reopenTab: deps.reopenTab,
				nextTab: () => deps.switchTab(1),
				prevTab: () => deps.switchTab(-1),
				toggleFocus: () => (deps.focus() === 'tree' ? deps.setFocus('editor') : deps.focusTree()),
				toggleSidebar: deps.toggleSidebar,
				toggleMarkdown: deps.toggleMarkdown,
				toggleDotfiles: deps.toggleDotfiles,
				toggleGitignored: deps.toggleGitignored,
				openSettings: deps.openSettings,
				openProjectSettings: deps.openProjectSettings,
				setVim: deps.applyVim,
				setTabSize: deps.applyTabSize,
				setTheme: deps.applyTheme,
				lineOp: (op) => deps.setLineOp((prev) => ({ op, key: (prev?.key ?? 0) + 1 })),
				toggleTrim: deps.toggleTrim,
				toggleFormat: deps.toggleFormat,
				toggleAutoSave: deps.toggleAutoSave,
				toggleTransparent: deps.toggleTransparent,
				problemsList: deps.problemsList,
				problemsNext: deps.problemsNext,
				problemsPrev: deps.problemsPrev,
				completion: deps.completion.show,
				goToDefinition: deps.completion.goToDefinition,
				commit: deps.gitCommands.openCommitPicker,
				sourceControl: deps.gitCommands.togglePanel,
				diffCurrent: () => deps.gitCommands.openDiff(deps.activePath()),
				diffAll: () => deps.gitCommands.openDiff(),
				compareBranches: deps.gitCommands.openBranchComparison,
				compareBranchCommits: deps.gitCommands.openBranchCommitComparison,
				compareAgainstBranch: deps.gitCommands.openDiffBasePicker,
				compareAgainstHead: deps.gitCommands.resetDiffBase,
				switchBranch: deps.gitCommands.openBranchSwitch,
				newBranch: deps.gitCommands.openBranchPrompt,
				newBranchFrom: deps.gitCommands.openBranchFrom,
				mergeBranch: deps.gitCommands.openBranchMerge,
				renameBranch: deps.gitCommands.openBranchRename,
				deleteBranch: deps.gitCommands.openBranchDelete,
				forceDeleteBranch: deps.gitCommands.openBranchForceDelete,
				undoCommit: deps.gitCommands.confirmUndoCommit,
				stash: deps.gitCommands.stash,
				stashPop: deps.gitCommands.stashPop,
				fetch: deps.gitCommands.fetch,
				pull: deps.gitCommands.pull,
				push: deps.gitCommands.push,
				showHelp: () => deps.setHelp(true),
				quit: deps.quit,
			},
			{
				vimEnabled: deps.config.vim,
				activeTheme: deps.config.theme,
				tabSize: deps.config.tabSize,
				trimOnSave: deps.config.trimOnSave,
				formatOnSave: deps.config.formatOnSave,
				autoSaveOnBlur: deps.config.autoSaveOnBlur,
				showDotfiles: deps.config.showDotfiles,
				respectGitignore: deps.config.respectGitignore,
			},
		),
	);
}
