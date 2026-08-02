import type { StyleDefinitionInput } from '@opentui/core';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { registerLocalThemes, type Theme, THEMES, type ThemeUi } from '../themes';
import { CONFIG_FILE, PROJECT_CONFIG_DIR } from './config';
import { loadIconThemes, type IconTheme } from './iconThemes';

export interface LocalThemeProblem {
	source: string;
	reason: string;
}

export interface LocalThemeLoad {
	themes: { id: string; theme: Theme }[];
	problems: LocalThemeProblem[];
}

export interface AppearancePluginLoad {
	themes: readonly { id: string; theme: Theme }[];
	iconThemes: readonly IconTheme[];
	plugins: readonly InstalledAppearancePlugin[];
	problems: LocalThemeProblem[];
}

export interface InstalledAppearancePlugin {
	id: string;
	version: string;
	source: string;
	disabled: boolean;
}

export function appearancePluginStatus(
	problems: readonly LocalThemeProblem[],
): { msg: string; tone: 'warn' } | null {
	const problem = problems[0];
	return problem ? { msg: `Appearance plugin skipped: ${problem.reason}`, tone: 'warn' } : null;
}

export const USER_THEME_PLUGIN_DIR = join(dirname(CONFIG_FILE), 'plugins');

const MANIFEST = 'plugin.json';
const HEX = /^#[\da-f]{6}$/i;
const UI_KEYS = Object.keys(THEMES.dark!.ui) as (keyof ThemeUi)[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isColor = (value: unknown): value is string => typeof value === 'string' && HEX.test(value);

function manifestsIn(dir: string): string[] {
	let entries: { name: string; isDir: boolean }[];
	try {
		entries = readdirSync(dir, { withFileTypes: true }).map((entry) => ({
			name: entry.name,
			isDir: entry.isDirectory(),
		}));
	} catch {
		return [];
	}
	return entries
		.filter((entry) =>
			entry.isDir ? true : entry.name.endsWith('.json') && entry.name !== 'index.json',
		)
		.map((entry) => (entry.isDir ? join(dir, entry.name, MANIFEST) : join(dir, entry.name)))
		.toSorted();
}

function parseTheme(raw: unknown): { id: string; theme: Theme } | null {
	if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
	if (!isRecord(raw.ui) || !isRecord(raw.syntax)) return null;
	const ui = {} as ThemeUi;
	for (const key of UI_KEYS) {
		const color = raw.ui[key];
		if (!isColor(color)) return null;
		ui[key] = color;
	}
	const syntax: Record<string, StyleDefinitionInput> = {};
	for (const [group, style] of Object.entries(raw.syntax)) {
		if (!isRecord(style)) return null;
		const parsed: StyleDefinitionInput = {};
		if (isColor(style.fg)) parsed.fg = style.fg;
		if (isColor(style.bg)) parsed.bg = style.bg;
		if (typeof style.bold === 'boolean') parsed.bold = style.bold;
		if (typeof style.italic === 'boolean') parsed.italic = style.italic;
		if (typeof style.underline === 'boolean') parsed.underline = style.underline;
		if (typeof style.dim === 'boolean') parsed.dim = style.dim;
		syntax[group] = parsed;
	}
	return { id: raw.id, theme: { name: raw.name, ui, syntax } };
}

function loadInstalledPlugins(
	rootDir: string,
	userDir = USER_THEME_PLUGIN_DIR,
	disabled: readonly string[] = [],
): InstalledAppearancePlugin[] {
	const sources = [
		...manifestsIn(userDir),
		...manifestsIn(join(rootDir, PROJECT_CONFIG_DIR, 'plugins')),
	];
	const plugins = new Map<string, InstalledAppearancePlugin>();
	for (const source of sources) {
		if (!existsSync(source)) continue;
		let raw: unknown;
		try {
			raw = JSON.parse(readFileSync(source, 'utf8'));
		} catch {
			continue;
		}
		if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.version !== 'string') continue;
		const hasAppearance =
			(Array.isArray(raw.themes) && raw.themes.length > 0) ||
			(Array.isArray(raw.icons) && raw.icons.length > 0);
		if (hasAppearance) {
			plugins.set(raw.id, {
				id: raw.id,
				version: raw.version,
				source,
				disabled: disabled.includes(raw.id),
			});
		}
	}
	return [...plugins.values()];
}

export function loadLocalThemes(
	rootDir: string,
	userDir = USER_THEME_PLUGIN_DIR,
	disabled: readonly string[] = [],
): LocalThemeLoad {
	const problems: LocalThemeProblem[] = [];
	const themes = new Map<string, Theme>();
	const sources = [
		...manifestsIn(userDir),
		...manifestsIn(join(rootDir, PROJECT_CONFIG_DIR, 'plugins')),
	];

	for (const source of sources) {
		if (!existsSync(source)) continue;
		let raw: unknown;
		try {
			raw = JSON.parse(readFileSync(source, 'utf8'));
		} catch (error) {
			problems.push({ source, reason: error instanceof Error ? error.message : String(error) });
			continue;
		}
		if (isRecord(raw) && typeof raw.id === 'string' && disabled.includes(raw.id)) continue;
		const entries = Array.isArray((raw as { themes?: unknown }).themes)
			? (raw as { themes: unknown[] }).themes
			: [];
		for (const entry of entries) {
			const theme = parseTheme(entry);
			if (!theme) {
				problems.push({ source, reason: 'invalid theme' });
				continue;
			}
			themes.set(theme.id, theme.theme);
		}
	}

	return { themes: [...themes].map(([id, theme]) => ({ id, theme })), problems };
}

export function loadAppearancePlugins(
	rootDir: string,
	userDir = USER_THEME_PLUGIN_DIR,
	disabled: readonly string[] = [],
): AppearancePluginLoad {
	const colorThemes = loadLocalThemes(rootDir, userDir, disabled);
	const iconThemes = loadIconThemes(rootDir, userDir, disabled);
	registerLocalThemes(colorThemes.themes);
	return {
		themes: colorThemes.themes,
		iconThemes: iconThemes.themes,
		plugins: loadInstalledPlugins(rootDir, userDir, disabled),
		problems: [...colorThemes.problems, ...iconThemes.problems],
	};
}
