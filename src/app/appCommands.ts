import { createMemo } from 'solid-js';

import type { Config } from '../core/config';
import type { TreeNode } from '../core/fs';
import type { ThemeName } from '../themes';
import { buildCommands } from './commands';
import type { Focus, Prompt } from './types';

export function createAppCommands(deps: {
	config: Config;
	saveActive: () => void;
	setPicker: (kind: 'files' | 'tabs') => void;
	activePath: () => string | null;
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
	toggleDotfiles: () => void;
	toggleGitignored: () => void;
	setLineOp: (
		update: (prev: { op: 'comment' | 'up' | 'down' | 'duplicate'; key: number } | null) => {
			op: 'comment' | 'up' | 'down' | 'duplicate';
			key: number;
		},
	) => void;
	patchConfig: (patch: Partial<Config>) => void;
	gitCommands: {
		openCommitPicker: () => void;
		confirmUndoCommit: () => void;
		stash: () => void;
		stashPop: () => void;
		fetch: () => void;
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
				toggleDotfiles: deps.toggleDotfiles,
				toggleGitignored: deps.toggleGitignored,
				setVim: deps.applyVim,
				setTabSize: deps.applyTabSize,
				setTheme: deps.applyTheme,
				lineOp: (op) => deps.setLineOp((prev) => ({ op, key: (prev?.key ?? 0) + 1 })),
				toggleTrim: () => {
					deps.patchConfig({ trimOnSave: !deps.config.trimOnSave });
					deps.say(`Trim on save ${deps.config.trimOnSave ? 'on' : 'off'}`);
				},
				toggleAutoSave: () => {
					deps.patchConfig({ autoSaveOnBlur: !deps.config.autoSaveOnBlur });
					deps.say(`Auto-save on blur ${deps.config.autoSaveOnBlur ? 'on' : 'off'}`);
				},
				commit: deps.gitCommands.openCommitPicker,
				undoCommit: deps.gitCommands.confirmUndoCommit,
				stash: deps.gitCommands.stash,
				stashPop: deps.gitCommands.stashPop,
				fetch: deps.gitCommands.fetch,
				push: deps.gitCommands.push,
				showHelp: () => deps.setHelp(true),
				quit: deps.quit,
			},
			{
				vimEnabled: deps.config.vim,
				activeTheme: deps.config.theme,
				tabSize: deps.config.tabSize,
				trimOnSave: deps.config.trimOnSave,
				autoSaveOnBlur: deps.config.autoSaveOnBlur,
				showDotfiles: deps.config.showDotfiles,
				respectGitignore: deps.config.respectGitignore,
			},
		),
	);
}
