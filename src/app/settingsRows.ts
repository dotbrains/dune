import { createMemo } from 'solid-js';
import type { Config } from '../core/config';
import type { ThemeName } from '../themes';
import { themeLabels } from '../themes';

export interface SettingRow {
	section: string;
	label: string;
	value: string;
	change: (dir: 1 | -1) => void;
}

const TAB_SIZES = [2, 4, 8];

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
		toggleAutoSave: () => void;
		toggleDotfiles: () => void;
		toggleGitignored: () => void;
		toggleTrim: () => void;
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
			label: 'Auto-save on blur and tab switch',
			value: onOff(config.autoSaveOnBlur),
			change: actions.toggleAutoSave,
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
	];
}

export function createSettingsRows(deps: Parameters<typeof settingsRows>[1] & { config: Config }) {
	return createMemo(() => settingsRows(deps.config, deps));
}
