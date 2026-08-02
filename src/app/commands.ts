/**
 * Command registry — the catalogue of everything dune can do. This tree is the
 * command palette (Ctrl+P), so it doubles as the feature index.
 *
 * A command either runs (`run`) or opens a submenu (`children`), never both.
 * Typing in the palette searches every leaf across all levels, so nesting keeps
 * the list short without hiding anything.
 *
 * To add a command: add an action to `CommandActions`, then an entry below. Set
 * `hint` when a keybinding also triggers it (keybindings live in keyboard.ts).
 */
import { THEME_ENTRIES, themeLabels } from '../themes';
import type { ThemeName } from '../themes';
import { ALT } from '../ui/keys';

export interface Command {
	id: string;
	label: string;
	/** Keybinding shown right-aligned, e.g. "Ctrl+S". Leaves only. */
	hint?: string;
	preview?: () => void;
	cancelPreview?: () => void;
	run?: () => void;
	children?: Command[];
}

export const KEYBINDABLE_COMMANDS: ReadonlyArray<{ id: string; label: string }> = [
	{ id: 'open', label: 'Open file…' },
	{ id: 'save', label: 'Save file' },
	{ id: 'tabs.switch', label: 'Switch to…' },
	{ id: 'navigation.back', label: 'Go back' },
	{ id: 'navigation.forward', label: 'Go forward' },
	{ id: 'tabs.reopen', label: 'Reopen closed tab' },
	{ id: 'goto', label: 'Go to line…' },
	{ id: 'find.file', label: 'In current file' },
	{ id: 'find.project', label: 'In project' },
	{ id: 'file.new', label: 'New file' },
	{ id: 'file.newDir', label: 'New folder' },
	{ id: 'tabs.close', label: 'Close tab' },
	{ id: 'view.sidebar', label: 'Toggle sidebar' },
	{ id: 'view.markdown', label: 'Markdown: rendered / source' },
	{ id: 'git.sourceControl', label: 'Source control panel' },
	{ id: 'problems.list', label: 'List problems' },
	{ id: 'problems.next', label: 'Next problem' },
	{ id: 'problems.prev', label: 'Previous problem' },
	{ id: 'problems.restart', label: 'Restart language servers' },
	{ id: 'editor.complete', label: 'Show completions' },
	{ id: 'help', label: 'Keyboard shortcuts' },
	{ id: 'quit', label: 'Quit' },
];

export interface CommandActions {
	save: () => void;
	openFile: () => void;
	openPathUnderCursor: () => void;
	goToDefinition: () => void;
	navigateBack: () => void;
	navigateForward: () => void;
	switchTab: () => void;
	closeOthers: () => void;
	closeAll: () => void;
	gotoLine: () => void;
	undo: () => void;
	redo: () => void;
	findInFile: () => void;
	findInProject: () => void;
	replaceInFile: () => void;
	newFile: () => void;
	newFolder: () => void;
	rename: () => void;
	cutForMove: () => void;
	copyForPaste: () => void;
	paste: () => void;
	remove: () => void;
	closeTab: () => void;
	reopenTab: () => void;
	nextTab: () => void;
	prevTab: () => void;
	toggleFocus: () => void;
	toggleSidebar: () => void;
	collapseSidebar: () => void;
	toggleDotfiles: () => void;
	toggleGitignored: () => void;
	toggleMarkdown: () => void;
	openSettings: () => void;
	openProjectSettings: () => void;
	listAppearancePlugins: () => void;
	checkAppearanceMarket: () => void;
	reloadAppearancePlugins: () => void;
	setVim: (enabled: boolean) => void;
	setTabSize: (size: number) => void;
	setTheme: (name: ThemeName) => void;
	previewTheme: (name: ThemeName) => void;
	cancelThemePreview: () => void;
	lineOp: (op: 'comment' | 'up' | 'down' | 'duplicate') => void;
	toggleTrim: () => void;
	toggleFormat: () => void;
	toggleAutoSave: () => void;
	toggleTransparent: () => void;
	problemsList: () => void;
	problemsNext: () => void;
	problemsPrev: () => void;
	problemsRestart: () => void;
	lspStatus: () => void;
	completion: () => void;
	commit: () => void;
	sourceControl: () => void;
	diffCurrent: () => void;
	diffAll: () => void;
	compareBranches: () => void;
	compareBranchCommits: () => void;
	compareAgainstBranch: () => void;
	compareAgainstHead: () => void;
	switchBranch: () => void;
	newBranch: () => void;
	newBranchFrom: () => void;
	mergeBranch: () => void;
	renameBranch: () => void;
	deleteBranch: () => void;
	forceDeleteBranch: () => void;
	undoCommit: () => void;
	stash: () => void;
	stashPop: () => void;
	fetch: () => void;
	pull: () => void;
	push: () => void;
	showHelp: () => void;
	quit: () => void;
}

export interface CommandContext {
	vimEnabled: boolean;
	activeTheme: ThemeName;
	tabSize: number;
	trimOnSave: boolean;
	formatOnSave: boolean;
	autoSaveOnBlur: boolean;
	showDotfiles: boolean;
	respectGitignore: boolean;
}

const TAB_SIZES = [2, 4, 8];

/** Marks the entry matching the current setting, so submenus show state. */
const check = (on: boolean) => (on ? '* ' : '  ');

export function buildCommands(actions: CommandActions, ctx: CommandContext): Command[] {
	return [
		{ id: 'open', label: 'Open file…', hint: 'Ctrl+O', run: actions.openFile },
		{ id: 'save', label: 'Save file', hint: 'Ctrl+S', run: actions.save },
		{ id: 'settings', label: 'Settings', run: actions.openSettings },
		{ id: 'settings.project', label: 'Settings: this project', run: actions.openProjectSettings },
		{ id: 'goto', label: 'Go to line…', hint: 'Ctrl+G', run: actions.gotoLine },
		{ id: 'undo', label: 'Undo', hint: 'Ctrl+Z', run: actions.undo },
		{ id: 'redo', label: 'Redo', hint: 'Ctrl+Y', run: actions.redo },
		{
			id: 'find',
			label: 'Find',
			children: [
				{ id: 'find.file', label: 'In current file', hint: 'Ctrl+F', run: actions.findInFile },
				{
					id: 'find.project',
					label: 'In project',
					hint: 'Ctrl+R',
					run: actions.findInProject,
				},
				{
					id: 'find.replace',
					label: 'Replace in current file',
					hint: 'Ctrl+F then Tab',
					run: actions.replaceInFile,
				},
			],
		},
		{
			id: 'file',
			label: 'File',
			children: [
				{ id: 'file.new', label: 'New file', hint: 'Ctrl+N', run: actions.newFile },
				{ id: 'open.cursor', label: 'Open file under cursor', run: actions.openPathUnderCursor },
				{ id: 'file.newDir', label: 'New folder', hint: `Ctrl+${ALT}+N`, run: actions.newFolder },
				{ id: 'file.rename', label: 'Rename…', hint: 'r', run: actions.rename },
				{ id: 'file.cut', label: 'Cut for moving', hint: 'x', run: actions.cutForMove },
				{ id: 'file.copy', label: 'Copy', hint: 'c', run: actions.copyForPaste },
				{ id: 'file.paste', label: 'Paste here', hint: 'p', run: actions.paste },
				{ id: 'file.delete', label: 'Delete…', hint: 'd', run: actions.remove },
			],
		},
		{
			id: 'tabs',
			label: 'Tabs',
			children: [
				{ id: 'tabs.switch', label: 'Switch to…', hint: 'Ctrl+T', run: actions.switchTab },
				{ id: 'tabs.close', label: 'Close tab', hint: 'Ctrl+W', run: actions.closeTab },
				{
					id: 'tabs.reopen',
					label: 'Reopen closed tab',
					hint: `Ctrl+${ALT}+T`,
					run: actions.reopenTab,
				},
				{ id: 'tabs.closeOthers', label: 'Close other tabs', run: actions.closeOthers },
				{ id: 'tabs.closeAll', label: 'Close all tabs', run: actions.closeAll },
				{ id: 'tabs.next', label: 'Next tab', hint: `Ctrl+${ALT}+→`, run: actions.nextTab },
				{ id: 'tabs.prev', label: 'Previous tab', hint: `Ctrl+${ALT}+←`, run: actions.prevTab },
				{
					id: 'navigation.back',
					label: 'Go back',
					hint: `Ctrl+${ALT}+Z`,
					run: actions.navigateBack,
				},
				{
					id: 'navigation.forward',
					label: 'Go forward',
					hint: `Ctrl+${ALT}+Y`,
					run: actions.navigateForward,
				},
			],
		},
		{
			id: 'view',
			label: 'View',
			children: [
				{
					id: 'view.sidebar',
					label: 'Toggle sidebar',
					hint: 'Ctrl+B',
					run: actions.toggleSidebar,
				},
				{
					id: 'view.focus',
					label: 'Focus tree / editor',
					hint: 'Tab in · Esc out',
					run: actions.toggleFocus,
				},
				{
					id: 'view.collapseSidebar',
					label: 'Collapse folders in sidebar',
					run: actions.collapseSidebar,
				},
				{
					id: 'view.markdown',
					label: 'Markdown: rendered / source',
					hint: `Ctrl+${ALT}+M`,
					run: actions.toggleMarkdown,
				},
				{
					id: 'view.dotfiles',
					label: `${check(ctx.showDotfiles)}Show dotfiles`,
					run: actions.toggleDotfiles,
				},
				{
					id: 'view.gitignored',
					label: `${check(ctx.respectGitignore)}Hide gitignored files`,
					run: actions.toggleGitignored,
				},
			],
		},
		{
			id: 'themes',
			label: 'Themes',
			children: [
				{
					id: 'themes.listAppearancePlugins',
					label: 'List local appearance plugins',
					run: actions.listAppearancePlugins,
				},
				{
					id: 'themes.checkAppearanceMarket',
					label: 'Check appearance plugin market',
					run: actions.checkAppearanceMarket,
				},
				{
					id: 'themes.reloadAppearancePlugins',
					label: 'Reload local appearance plugins',
					run: actions.reloadAppearancePlugins,
				},
				...THEME_ENTRIES.map(([name]) => ({
					id: `themes.${name}`,
					label: `${check(ctx.activeTheme === name)}${themeLabels[name]}`,
					preview: () => actions.previewTheme(name),
					cancelPreview: actions.cancelThemePreview,
					run: () => actions.setTheme(name),
				})),
			],
		},
		{
			id: 'editor',
			label: 'Editor',
			children: [
				// Also commands because the chords are not always sendable: some layouts
				// have no byte for Ctrl+/ at all.
				{
					id: 'editor.complete',
					label: 'Show completions',
					run: actions.completion,
				},
				{
					id: 'goto.definition',
					label: 'Go to definition',
					run: actions.goToDefinition,
				},
				{
					id: 'editor.comment',
					label: 'Toggle comment',
					hint: 'Ctrl+/ · Ctrl+L',
					run: () => actions.lineOp('comment'),
				},
				{
					id: 'editor.lineUp',
					label: 'Move line up',
					hint: `${ALT}+↑`,
					run: () => actions.lineOp('up'),
				},
				{
					id: 'editor.lineDown',
					label: 'Move line down',
					hint: `${ALT}+↓`,
					run: () => actions.lineOp('down'),
				},
				{
					id: 'editor.duplicate',
					label: 'Duplicate line',
					hint: `${ALT}+Shift+↓`,
					run: () => actions.lineOp('duplicate'),
				},
				{
					id: 'editor.vimOn',
					label: `${check(ctx.vimEnabled)}Vim mode on`,
					run: () => actions.setVim(true),
				},
				{
					id: 'editor.vimOff',
					label: `${check(!ctx.vimEnabled)}Vim mode off`,
					run: () => actions.setVim(false),
				},
				{
					id: 'editor.tabSize',
					label: 'Tab size',
					children: TAB_SIZES.map((size) => ({
						id: `editor.tabSize.${size}`,
						label: `${check(ctx.tabSize === size)}${size} spaces`,
						run: () => actions.setTabSize(size),
					})),
				},
				{
					id: 'editor.trim',
					label: `${check(ctx.trimOnSave)}Trim trailing whitespace on save`,
					run: actions.toggleTrim,
				},
				{
					id: 'editor.formatOnSave',
					label: `${check(ctx.formatOnSave)}Format on save`,
					run: actions.toggleFormat,
				},
				{
					id: 'editor.autoSave',
					label: `${check(ctx.autoSaveOnBlur)}Auto-save on blur and tab switch`,
					run: actions.toggleAutoSave,
				},
			],
		},
		{
			id: 'appearance',
			label: 'Appearance',
			children: [
				{
					id: 'appearance.transparent',
					label: 'Transparent background',
					run: actions.toggleTransparent,
				},
			],
		},
		{
			id: 'problems',
			label: 'Problems',
			children: [
				{ id: 'problems.list', label: 'List problems', run: actions.problemsList },
				{ id: 'problems.next', label: 'Next problem', run: actions.problemsNext },
				{ id: 'problems.prev', label: 'Previous problem', run: actions.problemsPrev },
				{ id: 'problems.restart', label: 'Restart language servers', run: actions.problemsRestart },
				{ id: 'problems.lspStatus', label: 'Language server status', run: actions.lspStatus },
			],
		},
		{
			id: 'git',
			label: 'Git',
			children: [
				{ id: 'git.commit', label: 'Commit…', run: actions.commit },
				{ id: 'git.sourceControl', label: 'Source control panel', run: actions.sourceControl },
				{ id: 'git.diffCurrent', label: 'Diff current file', run: actions.diffCurrent },
				{ id: 'git.diffAll', label: 'Diff all changes', run: actions.diffAll },
				{
					id: 'git.compareAgainstBranch',
					label: 'Compare against branch…',
					run: actions.compareAgainstBranch,
				},
				{
					id: 'git.compareAgainstHead',
					label: 'Compare against HEAD',
					run: actions.compareAgainstHead,
				},
				{ id: 'git.compareBranches', label: 'Compare branches', run: actions.compareBranches },
				{
					id: 'git.compareBranchCommits',
					label: 'Compare branch commits',
					run: actions.compareBranchCommits,
				},
				{ id: 'git.switchBranch', label: 'Switch branch…', run: actions.switchBranch },
				{ id: 'git.newBranch', label: 'New branch…', run: actions.newBranch },
				{ id: 'git.newBranchFrom', label: 'New branch from…', run: actions.newBranchFrom },
				{ id: 'git.mergeBranch', label: 'Merge branch…', run: actions.mergeBranch },
				{ id: 'git.renameBranch', label: 'Rename branch…', run: actions.renameBranch },
				{ id: 'git.deleteBranch', label: 'Delete branch…', run: actions.deleteBranch },
				{
					id: 'git.forceDeleteBranch',
					label: 'Delete branch (force)…',
					run: actions.forceDeleteBranch,
				},
				{ id: 'git.undoCommit', label: 'Undo last commit…', run: actions.undoCommit },
				{ id: 'git.stash', label: 'Stash changes', run: actions.stash },
				{ id: 'git.stashPop', label: 'Stash pop', run: actions.stashPop },
				{ id: 'git.fetch', label: 'Fetch', run: actions.fetch },
				{ id: 'git.pull', label: 'Pull (fast-forward only)', run: actions.pull },
				{ id: 'git.push', label: 'Push', run: actions.push },
			],
		},
		{ id: 'help', label: 'Keyboard shortcuts', run: actions.showHelp },
		{ id: 'quit', label: 'Quit', hint: 'Ctrl+Q', run: actions.quit },
	];
}

export interface FlatCommand {
	command: Command;
	/** Breadcrumb of ancestor labels, e.g. ["Themes"]. */
	trail: string[];
}

/** Every runnable leaf, with its path — used while filtering. */
export function flattenCommands(commands: Command[], trail: string[] = []): FlatCommand[] {
	return commands.flatMap((command) =>
		command.children
			? flattenCommands(command.children, [...trail, command.label])
			: [{ command, trail }],
	);
}
