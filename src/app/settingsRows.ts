import { createMemo } from 'solid-js';
import type { Config } from '../core/config';
import type { ThemeName } from '../themes';
import { themeLabels } from '../themes';
import type { SettingRow } from '../ui/overlays/SettingsView';

export type { SettingRow } from '../ui/overlays/SettingsView';

const TAB_SIZES = [2, 4, 8];
const DIFF_VIEWS = ['inline', 'split'] as const;

const onOff = (value: boolean) => (value ? 'on' : 'off');

function cycle<T>(values: readonly T[], current: T, dir: 1 | -1): T {
	const at = Math.max(0, values.indexOf(current));
	return values[(at + dir + values.length) % values.length]!;
}

export function settingsRows(
	config: Config,
	actions: {
		applyTheme: (name: ThemeName) => void;
		applyTabSize: (size: number) => void;
		applyVim: (enabled: boolean) => void;
		editFormatter: () => void;
		editKeybinding: () => void;
		editSidebarWidth: () => void;
		toggleThemeSync: () => void;
		toggleAutoSave: () => void;
		toggleTransparent: () => void;
		toggleDotfiles: () => void;
		toggleGitignored: () => void;
		toggleFormat: () => void;
		toggleTrim: () => void;
		patchConfig: (patch: Partial<Config>, scope?: 'user' | 'project') => void;
		configScope: () => 'user' | 'project';
	},
): SettingRow[] {
	const themes = Object.keys(themeLabels) as ThemeName[];
	return [
		{
			section: 'Appearance',
			label: 'Theme',
			value: themeLabels[config.theme],
			change: (dir) => actions.applyTheme(cycle(themes, config.theme, dir)),
		},
		{
			section: 'Appearance',
			label: 'Follow OS appearance',
			value: onOff(config.themeSync),
			change: actions.toggleThemeSync,
		},
		{
			section: 'Appearance',
			label: 'Transparent background',
			value: onOff(config.transparent),
			change: actions.toggleTransparent,
		},
		{
			section: 'Editor',
			label: 'Vim mode',
			value: onOff(config.vim),
			change: () => actions.applyVim(!config.vim),
		},
		{
			section: 'Editor',
			label: 'Tab size',
			value: `${config.tabSize}`,
			change: (dir) => actions.applyTabSize(cycle(TAB_SIZES, config.tabSize, dir)),
		},
		{
			section: 'Editor',
			label: 'Trim trailing whitespace on save',
			value: onOff(config.trimOnSave),
			change: actions.toggleTrim,
		},
		{
			section: 'Editor',
			label: 'Format on save',
			value: onOff(config.formatOnSave),
			change: actions.toggleFormat,
		},
		{
			section: 'Editor',
			label: 'Add/update formatter…',
			value: `${Object.keys(config.formatters).length} configured`,
			change: actions.editFormatter,
		},
		{
			section: 'Editor',
			label: 'Auto-save on blur and tab switch',
			value: onOff(config.autoSaveOnBlur),
			change: actions.toggleAutoSave,
		},
		{
			section: 'Editor',
			label: 'Add/update shortcut…',
			value: `${Object.keys(config.keybindings).length} custom`,
			change: actions.editKeybinding,
		},
		{
			section: 'Tree',
			label: 'Sidebar width',
			value: `${config.sidebarWidth}`,
			change: actions.editSidebarWidth,
		},
		{
			section: 'Tree',
			label: 'Show dotfiles',
			value: onOff(config.showDotfiles),
			change: actions.toggleDotfiles,
		},
		{
			section: 'Tree',
			label: 'Hide gitignored files',
			value: onOff(config.respectGitignore),
			change: actions.toggleGitignored,
		},
		{
			section: 'Git',
			label: 'Diff layout',
			value: config.diffView,
			change: (dir) =>
				actions.patchConfig(
					{ diffView: cycle(DIFF_VIEWS, config.diffView, dir) },
					actions.configScope(),
				),
		},
	];
}

export function createSettingsRows(deps: Parameters<typeof settingsRows>[1] & { config: Config }) {
	return createMemo(() => settingsRows(deps.config, deps));
}
