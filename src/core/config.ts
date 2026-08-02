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
import type { Formatters } from './format';
import type { ThemeName } from '../themes';

export const CONFIG_FILE = join(
	process.env.XDG_CONFIG_HOME ?? join(os.homedir(), '.config'),
	'dune',
	'config.json',
);
export const PROJECT_CONFIG_DIR = '.dune';
export const projectConfigFile = (rootDir: string): string =>
	join(rootDir, PROJECT_CONFIG_DIR, 'settings.json');
export const CURSOR_STYLES = ['block', 'line', 'underline'] as const;
export type CursorStyle = (typeof CURSOR_STYLES)[number];
export const ICON_THEMES = ['none', 'unicode'] as const;
export type IconThemeName = string;

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
	/** Follow the OS light/dark appearance using the light and dark theme slots. */
	themeSync: boolean;
	/** Theme used when the OS appearance is light and themeSync is enabled. */
	themeLight: ThemeName;
	/** Theme used when the OS appearance is dark and themeSync is enabled. */
	themeDark: ThemeName;
	/** Leave the editor and tab strip unpainted for translucent terminals. */
	transparent: boolean;
	/** File-tree glyph set; `none` keeps the plain expansion arrows. */
	iconTheme: IconThemeName;
	/** Modal editing (normal / insert / visual). */
	vim: boolean;
	/** Editor caret shape when vim mode is not overriding it. */
	cursorStyle: CursorStyle;
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
	/** Run a configured external formatter after saving matching files. */
	formatOnSave: boolean;
	/** File extension keys (`ts`, `js,jsx`, `*`) mapped to formatter argv arrays. */
	formatters: Formatters;
	/** Save every dirty buffer when the terminal window loses focus. */
	autoSaveOnBlur: boolean;
	/** Whether the tree lists dotfiles. Defaults to the filesystem's truth. */
	showDotfiles: boolean;
	/** Hide gitignored files from the tree; dimming still happens when they are shown. */
	respectGitignore: boolean;
	/** Diff presentation in Git overlays. */
	diffView: 'inline' | 'split';
	/** Changed-files presentation in the source control panel. */
	gitPanelView: 'tree' | 'list';
	/** Language servers: spawn matching servers as files open. */
	lsp: boolean;
	/** Completion menu while typing. Requires `lsp` to be enabled. */
	lspCompletion: boolean;
	/** Show the first diagnostic message beside each affected line. */
	lspInline: boolean;
	/** Offer to install missing npm-backed language servers into dune's data dir. */
	lspAutoInstall: boolean;
	/** TypeScript SDK path passed to typescript-language-server. Empty lets it choose. */
	typescriptTsdk: string;
	/** Per-server command override. An empty array disables that server. */
	lspServers: Record<string, string[]>;
	/** Custom global shortcuts by command id, e.g. `{ "open": "Ctrl+Alt+O" }`. */
	keybindings: Record<string, string>;
	/** Directory URL whose `index.json` lists appearance plugin manifests. */
	pluginRegistry: string;
	/** Check the appearance plugin catalog at startup for installed plugin updates. */
	pluginUpdates: boolean;
	/** Local appearance plugin ids to list but not register. */
	disabledAppearancePlugins: string[];
}

export const DEFAULTS: Config = {
	theme: 'dark',
	themeSync: true,
	themeLight: 'light',
	themeDark: 'dark',
	transparent: false,
	iconTheme: 'none',
	vim: false,
	cursorStyle: 'block',
	tabSize: 2,
	sidebarWidth: 'auto',
	skipUpdate: '',
	trimOnSave: false,
	formatOnSave: false,
	formatters: {},
	autoSaveOnBlur: true,
	showDotfiles: true,
	respectGitignore: false,
	diffView: 'inline',
	gitPanelView: 'tree',
	lsp: false,
	lspCompletion: true,
	lspInline: true,
	lspAutoInstall: true,
	typescriptTsdk: '',
	lspServers: {},
	keybindings: {},
	pluginRegistry: 'https://dune.dotbrains.dev/plugins/',
	pluginUpdates: true,
	disabledAppearancePlugins: [],
};

function parsePartial(raw: unknown): Partial<Config> {
	const obj = (raw ?? {}) as Partial<Record<keyof Config, unknown>>;
	const config: Partial<Config> = {};
	if (isThemeName(obj.theme)) config.theme = obj.theme;
	if (typeof obj.themeSync === 'boolean') config.themeSync = obj.themeSync;
	if (isThemeName(obj.themeLight)) config.themeLight = obj.themeLight;
	if (isThemeName(obj.themeDark)) config.themeDark = obj.themeDark;
	if (typeof obj.transparent === 'boolean') config.transparent = obj.transparent;
	if (typeof obj.iconTheme === 'string' && obj.iconTheme.length > 0)
		config.iconTheme = obj.iconTheme;
	if (typeof obj.vim === 'boolean') config.vim = obj.vim;
	if (CURSOR_STYLES.includes(obj.cursorStyle as CursorStyle)) {
		config.cursorStyle = obj.cursorStyle as CursorStyle;
	}
	if (typeof obj.tabSize === 'number' && obj.tabSize >= 1 && obj.tabSize <= 16) {
		config.tabSize = Math.floor(obj.tabSize);
	}
	if (typeof obj.skipUpdate === 'string') config.skipUpdate = obj.skipUpdate;
	if (typeof obj.trimOnSave === 'boolean') config.trimOnSave = obj.trimOnSave;
	if (typeof obj.formatOnSave === 'boolean') config.formatOnSave = obj.formatOnSave;
	if (obj.formatters && typeof obj.formatters === 'object' && !Array.isArray(obj.formatters)) {
		const formatters: Formatters = {};
		for (const [key, value] of Object.entries(obj.formatters)) {
			if (
				typeof key === 'string' &&
				Array.isArray(value) &&
				value.every((part): part is string => typeof part === 'string')
			) {
				formatters[key] = value;
			}
		}
		config.formatters = formatters;
	}
	if (typeof obj.autoSaveOnBlur === 'boolean') config.autoSaveOnBlur = obj.autoSaveOnBlur;
	if (typeof obj.showDotfiles === 'boolean') config.showDotfiles = obj.showDotfiles;
	if (typeof obj.respectGitignore === 'boolean') config.respectGitignore = obj.respectGitignore;
	if (obj.diffView === 'split' || obj.diffView === 'inline') config.diffView = obj.diffView;
	if (obj.gitPanelView === 'tree' || obj.gitPanelView === 'list') {
		config.gitPanelView = obj.gitPanelView;
	}
	if (typeof obj.lsp === 'boolean') config.lsp = obj.lsp;
	if (typeof obj.lspCompletion === 'boolean') config.lspCompletion = obj.lspCompletion;
	if (typeof obj.lspInline === 'boolean') config.lspInline = obj.lspInline;
	if (typeof obj.lspAutoInstall === 'boolean') config.lspAutoInstall = obj.lspAutoInstall;
	if (typeof obj.typescriptTsdk === 'string') config.typescriptTsdk = obj.typescriptTsdk;
	if (obj.lspServers && typeof obj.lspServers === 'object' && !Array.isArray(obj.lspServers)) {
		const lspServers: Record<string, string[]> = {};
		for (const [id, value] of Object.entries(obj.lspServers)) {
			if (
				typeof id === 'string' &&
				Array.isArray(value) &&
				value.every((part): part is string => typeof part === 'string')
			) {
				lspServers[id] = value;
			}
		}
		config.lspServers = lspServers;
	}
	if (obj.keybindings && typeof obj.keybindings === 'object' && !Array.isArray(obj.keybindings)) {
		const keybindings: Record<string, string> = {};
		for (const [id, value] of Object.entries(obj.keybindings)) {
			if (typeof value === 'string') keybindings[id] = value;
		}
		config.keybindings = keybindings;
	}
	if (typeof obj.pluginRegistry === 'string' && obj.pluginRegistry.startsWith('https://')) {
		config.pluginRegistry = obj.pluginRegistry;
	}
	if (typeof obj.pluginUpdates === 'boolean') config.pluginUpdates = obj.pluginUpdates;
	if (Array.isArray(obj.disabledAppearancePlugins)) {
		config.disabledAppearancePlugins = obj.disabledAppearancePlugins.filter(
			(entry): entry is string => typeof entry === 'string' && /^[\w.-]+$/.test(entry),
		);
	}
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

export function resolvedTheme(config: Config, appearance: 'dark' | 'light' | null): ThemeName {
	if (!config.themeSync || !appearance) return config.theme;
	return config[appearance === 'dark' ? 'themeDark' : 'themeLight'];
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
