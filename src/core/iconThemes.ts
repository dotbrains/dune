import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { CONFIG_FILE, PROJECT_CONFIG_DIR } from './config';

export interface IconRule {
	glyph: string;
	color?: string;
}

export interface IconTheme {
	id: string;
	name: string;
	file: IconRule;
	folder: IconRule;
	folderOpen: IconRule;
	extensions: Record<string, IconRule>;
	names: Record<string, IconRule>;
	folders: Record<string, IconRule>;
	foldersOpen: Record<string, IconRule>;
}

export interface IconThemeProblem {
	source: string;
	reason: string;
}

export interface IconThemeLoad {
	themes: IconTheme[];
	problems: IconThemeProblem[];
}

export const USER_ICON_PLUGIN_DIR = join(dirname(CONFIG_FILE), 'plugins');

const MANIFEST = 'plugin.json';
const HEX = /^#[\da-f]{6}$/i;
const WIDE =
	/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]|[\u{1f000}-\u{effff}]/u;

const icon = (value: unknown): IconRule | null => {
	const raw = typeof value === 'string' ? { glyph: value } : value;
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as { glyph?: unknown; color?: unknown };
	if (typeof obj.glyph !== 'string' || Array.from(obj.glyph).length !== 1 || WIDE.test(obj.glyph))
		return null;
	const color = typeof obj.color === 'string' && HEX.test(obj.color) ? obj.color : undefined;
	return color ? { glyph: obj.glyph, color } : { glyph: obj.glyph };
};

interface IconDefinition {
	icon: IconRule;
	open?: IconRule;
}

const definitions = (value: unknown): Record<string, IconDefinition> => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const parsed: Record<string, IconDefinition> = {};
	for (const [key, raw] of Object.entries(value)) {
		const base = icon(raw);
		if (!base) continue;
		const open =
			raw && typeof raw === 'object' && !Array.isArray(raw)
				? icon({ ...raw, glyph: (raw as { open?: unknown }).open })
				: null;
		parsed[key] = open ? { icon: base, open } : { icon: base };
	}
	return parsed;
};

const resolveIcon = (value: unknown, icons: Record<string, IconDefinition>): IconRule | null =>
	icon(value) ?? (typeof value === 'string' ? (icons[value]?.icon ?? null) : null);

const rules = (
	value: unknown,
	icons: Record<string, IconDefinition>,
	keyFor: (key: string) => string,
): Record<string, IconRule> | null => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const parsed: Record<string, IconRule> = {};
	for (const [key, raw] of Object.entries(value)) {
		const rule = resolveIcon(raw, icons);
		if (!rule || rule.glyph === '') return null;
		parsed[keyFor(key)] = rule;
	}
	return parsed;
};

const wholeName = (name: string): string => name.toLowerCase();
const extensionName = (name: string): string => name.toLowerCase().replace(/^\./, '');

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

function parseIconTheme(raw: unknown): IconTheme | null {
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as Record<string, unknown>;
	if (typeof obj.id !== 'string' || typeof obj.name !== 'string') return null;
	const icons = definitions(obj.definitions);
	const file = obj.file === undefined ? { glyph: '·' } : resolveIcon(obj.file, icons);
	const folder = obj.folder === undefined ? { glyph: '▸' } : resolveIcon(obj.folder, icons);
	const folderOpen =
		obj.folderOpen === undefined ? (folder ?? { glyph: '▾' }) : resolveIcon(obj.folderOpen, icons);
	const extensions = rules(obj.extensions, icons, extensionName);
	const names = rules(obj.names, icons, wholeName);
	const folders = rules(obj.folders, icons, wholeName);
	const foldersOpen = rules(obj.foldersOpen, icons, wholeName);
	if (!file || !folder || !folderOpen || !extensions || !names || !folders || !foldersOpen) {
		return null;
	}
	if (obj.folders && typeof obj.folders === 'object' && !Array.isArray(obj.folders)) {
		for (const [name, value] of Object.entries(obj.folders)) {
			const open = typeof value === 'string' ? icons[value]?.open : undefined;
			const key = wholeName(name);
			if (open && !(key in foldersOpen)) foldersOpen[key] = open;
		}
	}
	return {
		id: obj.id,
		name: obj.name,
		file,
		folder,
		folderOpen,
		extensions,
		names,
		folders,
		foldersOpen,
	};
}

export function loadIconThemes(
	rootDir: string,
	userDir = USER_ICON_PLUGIN_DIR,
	disabled: readonly string[] = [],
): IconThemeLoad {
	const problems: IconThemeProblem[] = [];
	const themes = new Map<string, IconTheme>();
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
		if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
			const id = (raw as { id?: unknown }).id;
			if (typeof id === 'string' && disabled.includes(id)) continue;
		}
		const icons = Array.isArray((raw as { icons?: unknown }).icons)
			? (raw as { icons: unknown[] }).icons
			: [];
		for (const entry of icons) {
			const theme = parseIconTheme(entry);
			if (!theme) {
				problems.push({ source, reason: 'invalid icon theme' });
				continue;
			}
			themes.set(theme.id, theme);
		}
	}

	return { themes: [...themes.values()], problems };
}
