import type { StyleDefinitionInput } from '@opentui/core';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

import { clearLocalLanguages, registerLocalLanguages, type Language } from '../languages';
import { GRAMMARS } from '../languages/grammars';
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
	name: string;
	version: string;
	detail: string;
	source: string;
	disabled: boolean;
}

export function appearancePluginStatus(
	problems: readonly LocalThemeProblem[],
): { msg: string; tone: 'warn' } | null {
	const problem = problems[0];
	return problem ? { msg: `Plugin skipped: ${problem.reason}`, tone: 'warn' } : null;
}

export const USER_THEME_PLUGIN_DIR = join(dirname(CONFIG_FILE), 'plugins');

const MANIFEST = 'plugin.json';
const HEX = /^#[\da-f]{6}$/i;
const ID = /^[\w.-]+$/;
const UI_KEYS = Object.keys(THEMES.dark!.ui) as (keyof ThemeUi)[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isColor = (value: unknown): value is string => typeof value === 'string' && HEX.test(value);

const strings = (value: unknown): string[] | null => {
	if (!Array.isArray(value)) return null;
	const out = value.filter((entry) => typeof entry === 'string' && entry.length > 0);
	return out.length === value.length && out.length > 0 ? out : null;
};

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

function pluginAsset(source: string, value: unknown): string | null {
	if (typeof value !== 'string' || value.length === 0) return null;
	if (value.startsWith('/') || value.includes('\0') || /^[a-z]+:/i.test(value)) return null;
	const normalized = normalize(value);
	if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('..\\')) {
		return null;
	}
	return join(dirname(source), normalized);
}

function parseLanguageIn(raw: unknown, source: string | undefined): Language | null {
	if (!isRecord(raw) || typeof raw.id !== 'string' || !ID.test(raw.id)) return null;
	const language: Language = { id: raw.id };
	if (typeof raw.label === 'string' && raw.label.length > 0) language.label = raw.label;
	if (typeof raw.lineComment === 'string' && raw.lineComment.length > 0) {
		language.lineComment = raw.lineComment;
	}
	if (isRecord(raw.grammar)) {
		if (typeof raw.grammar.vendored === 'string') {
			const grammar = GRAMMARS[raw.grammar.vendored as keyof typeof GRAMMARS];
			if (!grammar) return null;
			language.wasm = grammar.wasm;
			language.query = grammar.query;
		} else if (raw.grammar.bundled === true) language.bundled = true;
		else if (source) {
			const wasm = pluginAsset(source, raw.grammar.wasm);
			const query = pluginAsset(source, raw.grammar.query);
			if (wasm && query) {
				language.wasm = wasm;
				language.query = query;
			}
		}
	}
	if (Array.isArray(raw.patterns)) {
		const patterns: NonNullable<Language['patterns']> = [];
		for (const entry of raw.patterns) {
			if (!isRecord(entry) || typeof entry.group !== 'string' || typeof entry.re !== 'string') {
				return null;
			}
			try {
				const flags = typeof entry.flags === 'string' ? entry.flags : '';
				patterns.push({
					group: entry.group,
					re: new RegExp(entry.re, flags.includes('g') ? flags : `${flags}g`),
				});
			} catch {
				return null;
			}
		}
		if (patterns.length > 0) language.patterns = patterns;
	}
	const extensions = strings(raw.extensions);
	if (extensions) language.extensions = extensions;
	const filenames = strings(raw.filenames);
	if (filenames) language.filenames = filenames;
	if (typeof raw.filenamePattern === 'string' && raw.filenamePattern.length > 0) {
		try {
			language.filenamePattern = new RegExp(raw.filenamePattern);
		} catch {
			return null;
		}
	}
	return language.bundled || (language.wasm && language.query) || language.patterns
		? language
		: null;
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
		const hasLanguages = Array.isArray(raw.languages) && raw.languages.length > 0;
		if (hasAppearance || hasLanguages) {
			const themes = Array.isArray(raw.themes)
				? raw.themes
						.map((entry) => (isRecord(entry) && typeof entry.id === 'string' ? entry.id : null))
						.filter((entry): entry is string => entry !== null)
				: [];
			const icons = Array.isArray(raw.icons)
				? raw.icons
						.map((entry) => (isRecord(entry) && typeof entry.id === 'string' ? entry.id : null))
						.filter((entry): entry is string => entry !== null)
				: [];
			const languages = Array.isArray(raw.languages)
				? raw.languages
						.map((entry) => (isRecord(entry) && typeof entry.id === 'string' ? entry.id : null))
						.filter((entry): entry is string => entry !== null)
				: [];
			const parts = [
				...(themes.length > 0 ? [`themes: ${themes.join(', ')}`] : []),
				...(icons.length > 0 ? [`icons: ${icons.join(', ')}`] : []),
				...(languages.length > 0 ? [`languages: ${languages.join(', ')}`] : []),
			];
			plugins.set(raw.id, {
				id: raw.id,
				name: typeof raw.name === 'string' && raw.name ? raw.name : raw.id,
				version: raw.version,
				detail: parts.join(' / '),
				source,
				disabled: disabled.includes(raw.id),
			});
		}
	}
	return [...plugins.values()];
}

export function loadLocalLanguages(
	rootDir: string,
	userDir = USER_THEME_PLUGIN_DIR,
	disabled: readonly string[] = [],
): { languages: Language[]; problems: LocalThemeProblem[] } {
	const problems: LocalThemeProblem[] = [];
	const languages: Language[] = [];
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
		if (!isRecord(raw) || (typeof raw.id === 'string' && disabled.includes(raw.id))) continue;
		const entries = Array.isArray(raw.languages) ? raw.languages : [];
		for (const entry of entries) {
			const language = parseLanguageIn(entry, source);
			if (!language) {
				problems.push({ source, reason: 'invalid language' });
				continue;
			}
			languages.push(language);
		}
	}
	return { languages, problems };
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
	const languages = loadLocalLanguages(rootDir, userDir, disabled);
	registerLocalThemes(colorThemes.themes);
	clearLocalLanguages();
	registerLocalLanguages(languages.languages);
	return {
		themes: colorThemes.themes,
		iconThemes: iconThemes.themes,
		plugins: loadInstalledPlugins(rootDir, userDir, disabled),
		problems: [...colorThemes.problems, ...iconThemes.problems, ...languages.problems],
	};
}
