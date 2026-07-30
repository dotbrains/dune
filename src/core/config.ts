/**
 * User settings, persisted as JSON at `$XDG_CONFIG_HOME/dune/config.json`
 * (default `~/.config/dune/config.json`), plus project overrides at
 * `<project>/.dune/settings.json`.
 *
 * To add a setting: add the field to `Config`, give it a value in `DEFAULTS`,
 * and validate it in `parsePartial()`. Anything missing or invalid falls back to the
 * default, so a hand-edited config can never break startup.
 */
import fs from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';

import { isThemeName } from '../themes';
import type { ThemeName } from '../themes';

export const CONFIG_FILE = join(
	process.env.XDG_CONFIG_HOME ?? join(os.homedir(), '.config'),
	'dune',
	'config.json',
);
export const PROJECT_CONFIG_DIR = '.dune';
export const projectConfigFile = (rootDir: string): string =>
	join(rootDir, PROJECT_CONFIG_DIR, 'settings.json');

/** Narrow enough to still show a name, wide enough to leave the editor usable. */
export const SIDEBAR_MIN = 15;
export const SIDEBAR_MAX = 80;

/**
 * `'auto'`: this share of the terminal, within these bounds. The floor is what an
 * 80-column window gets, so the automatic width only ever grows from what a fixed
 * default gave — a flat 30 columns is fine there and cramped at 200, where two
 * columns per nesting level leave a deep path almost nothing for its name.
 */
const AUTO_SHARE = 0.25;
const AUTO_MIN = 30;
const AUTO_MAX = 60;

export function sidebarColumns(width: number | 'auto', terminalWidth: number): number {
	if (width !== 'auto') return width;
	return Math.max(AUTO_MIN, Math.min(AUTO_MAX, Math.round(terminalWidth * AUTO_SHARE)));
}

export interface Config {
	/** Color scheme id — see src/themes. */
	theme: ThemeName;
	/** Leave the editor and tab strip unpainted for translucent terminals. */
	transparent: boolean;
	/** Modal editing (normal / insert / visual). */
	vim: boolean;
	/** Columns per indent level: indent guides and literal tabs both use it. */
	tabSize: number;
	/**
	 * Columns the file tree occupies, or `'auto'` for a share of the terminal —
	 * a fixed default is either cramped on a wide screen or greedy on a narrow one.
	 * Resizing with `[` / `]` or by dragging the divider pins an explicit number.
	 */
	sidebarWidth: number | 'auto';
	/** Version whose update notice was dismissed; suppresses the banner for it. */
	skipUpdate: string;
	/** On save: strip trailing spaces and end the file with one newline. */
	trimOnSave: boolean;
	/** Save every dirty buffer when the terminal window loses focus. */
	autoSaveOnBlur: boolean;
	/** Whether the tree lists dotfiles. Defaults to the filesystem's truth. */
	showDotfiles: boolean;
	/** Hide gitignored files from the tree; dimming still happens when they are shown. */
	respectGitignore: boolean;
	/** Diff presentation in Git overlays. */
	diffView: 'inline' | 'split';
}

export const DEFAULTS: Config = {
	theme: 'dark',
	transparent: false,
	vim: false,
	tabSize: 2,
	sidebarWidth: 'auto',
	skipUpdate: '',
	trimOnSave: false,
	autoSaveOnBlur: true,
	showDotfiles: true,
	respectGitignore: false,
	diffView: 'inline',
};

function parsePartial(raw: unknown): Partial<Config> {
	const obj = (raw ?? {}) as Partial<Record<keyof Config, unknown>>;
	const config: Partial<Config> = {};
	if (isThemeName(obj.theme)) config.theme = obj.theme;
	if (typeof obj.transparent === 'boolean') config.transparent = obj.transparent;
	if (typeof obj.vim === 'boolean') config.vim = obj.vim;
	if (typeof obj.tabSize === 'number' && obj.tabSize >= 1 && obj.tabSize <= 16) {
		config.tabSize = Math.floor(obj.tabSize);
	}
	if (typeof obj.skipUpdate === 'string') config.skipUpdate = obj.skipUpdate;
	if (typeof obj.trimOnSave === 'boolean') config.trimOnSave = obj.trimOnSave;
	if (typeof obj.autoSaveOnBlur === 'boolean') config.autoSaveOnBlur = obj.autoSaveOnBlur;
	if (typeof obj.showDotfiles === 'boolean') config.showDotfiles = obj.showDotfiles;
	if (typeof obj.respectGitignore === 'boolean') config.respectGitignore = obj.respectGitignore;
	if (obj.diffView === 'split' || obj.diffView === 'inline') config.diffView = obj.diffView;
	if (
		typeof obj.sidebarWidth === 'number' &&
		obj.sidebarWidth >= SIDEBAR_MIN &&
		obj.sidebarWidth <= SIDEBAR_MAX
	) {
		config.sidebarWidth = Math.floor(obj.sidebarWidth);
	} else if (obj.sidebarWidth === 'auto') {
		config.sidebarWidth = 'auto';
	}
	return config;
}

const parse = (raw: unknown): Config => ({ ...DEFAULTS, ...parsePartial(raw) });

export function resolveConfig(user: Config, project: Partial<Config>): Config {
	return { ...user, ...project };
}

/** Read the config file, falling back to defaults on any error or bad value. */
export function loadConfig(): Config {
	try {
		return parse(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
	} catch {
		return { ...DEFAULTS };
	}
}

export function loadProjectConfig(rootDir: string): Partial<Config> {
	try {
		return parsePartial(JSON.parse(fs.readFileSync(projectConfigFile(rootDir), 'utf8')));
	} catch {
		return {};
	}
}

export function saveConfig(config: Config): void {
	try {
		fs.mkdirSync(dirname(CONFIG_FILE), { recursive: true });
		fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
	} catch {
		// best-effort — running without a writable home just means no persistence
	}
}

export function saveProjectConfig(rootDir: string, config: Partial<Config>): void {
	try {
		const file = projectConfigFile(rootDir);
		fs.mkdirSync(dirname(file), { recursive: true });
		fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
	} catch {
		// best-effort — an unwritable project just means overrides do not persist
	}
}
