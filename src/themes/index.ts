/**
 * Theme runtime state.
 *
 * To add one: define a palette file and register it in `registry.ts`. It shows
 * up in the command palette automatically.
 */
import type { StyleDefinitionInput } from '@opentui/core';
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

import { THEME_ENTRIES as BUILTIN_THEME_ENTRIES, THEMES as BUILTIN_THEMES } from './registry';
import type { Theme, ThemeUi } from './types';

export type { Theme, ThemeUi };

export type ThemeName = string;

export let THEME_ENTRIES = [...BUILTIN_THEME_ENTRIES] as [string, Theme][];
export const THEMES = { ...BUILTIN_THEMES } as Record<string, Theme> & typeof BUILTIN_THEMES;
export const themeLabels: Record<string, string> = Object.fromEntries(
	THEME_ENTRIES.map(([id, theme]) => [id, theme.name]),
);

const DEFAULT: ThemeName = 'dark';
let currentTheme: ThemeName = DEFAULT;
let transparent = false;
const [activeTheme, setActiveTheme] = createSignal<ThemeName>(DEFAULT);
export { activeTheme };

function colorsFor(name: ThemeName): ThemeUi {
	const base = THEMES[name]?.ui ?? THEMES[DEFAULT]!.ui;
	return transparent ? { ...base, bg: 'transparent', barBg: 'transparent' } : base;
}

// `ui` is a store, not a plain object: Solid components never re-render, so a
// mutated object would leave every color on screen stale after a theme switch.
// Reading `ui.bg` inside JSX subscribes that spot to the change.
const [ui, setUi] = createStore<ThemeUi>({ ...colorsFor(DEFAULT) });
export { ui };

// Read imperatively when the syntax style table is rebuilt, so a plain object is fine.
export const syntaxTheme: Record<string, StyleDefinitionInput> = { ...THEMES[DEFAULT]!.syntax };

export function isThemeName(value: unknown): value is ThemeName {
	return typeof value === 'string' && value in THEMES;
}

export function registerLocalThemes(themes: readonly { id: string; theme: Theme }[]): void {
	THEME_ENTRIES = [...BUILTIN_THEME_ENTRIES] as [string, Theme][];
	for (const key of Object.keys(THEMES)) delete THEMES[key];
	Object.assign(THEMES, BUILTIN_THEMES);
	for (const key of Object.keys(themeLabels)) delete themeLabels[key];
	for (const [id, theme] of THEME_ENTRIES) themeLabels[id] = theme.name;
	for (const { id, theme } of themes) {
		THEMES[id] = theme;
		themeLabels[id] = theme.name;
		const at = THEME_ENTRIES.findIndex(([existing]) => existing === id);
		if (at === -1) THEME_ENTRIES.push([id, theme]);
		else THEME_ENTRIES[at] = [id, theme];
	}
}

export function setTheme(name: ThemeName): void {
	currentTheme = name;
	setActiveTheme(name);
	setUi(colorsFor(name));
	// Replace, never merge: a group the new theme omits would otherwise keep the
	// previous theme's color and render invisible when light/dark flips.
	for (const group of Object.keys(syntaxTheme)) delete syntaxTheme[group];
	Object.assign(syntaxTheme, (THEMES[name] ?? THEMES[DEFAULT]!).syntax);
}

export function setTransparency(on: boolean): void {
	transparent = on;
	setUi(colorsFor(currentTheme));
}
