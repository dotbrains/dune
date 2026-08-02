/**
 * Theme runtime state.
 *
 * To add one: define a palette file and register it in `registry.ts`. It shows
 * up in the command palette automatically.
 */
import type { StyleDefinitionInput } from '@opentui/core';
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

import { THEME_ENTRIES, THEMES } from './registry';
import type { Theme, ThemeUi } from './types';

export { THEME_ENTRIES, THEMES } from './registry';
export type { Theme, ThemeUi };

export type ThemeName = keyof typeof THEMES;

export const themeLabels = Object.fromEntries(
	THEME_ENTRIES.map(([id, theme]) => [id, theme.name]),
) as Record<ThemeName, string>;

const DEFAULT: ThemeName = 'dark';
let currentTheme: ThemeName = DEFAULT;
let transparent = false;
const [activeTheme, setActiveTheme] = createSignal<ThemeName>(DEFAULT);
export { activeTheme };

function colorsFor(name: ThemeName): ThemeUi {
	const base = THEMES[name].ui;
	return transparent ? { ...base, bg: 'transparent', barBg: 'transparent' } : base;
}

// `ui` is a store, not a plain object: Solid components never re-render, so a
// mutated object would leave every color on screen stale after a theme switch.
// Reading `ui.bg` inside JSX subscribes that spot to the change.
const [ui, setUi] = createStore<ThemeUi>({ ...colorsFor(DEFAULT) });
export { ui };

// Read imperatively when the syntax style table is rebuilt, so a plain object is fine.
export const syntaxTheme: Record<string, StyleDefinitionInput> = { ...THEMES[DEFAULT].syntax };

export function isThemeName(value: unknown): value is ThemeName {
	return typeof value === 'string' && value in THEMES;
}

export function setTheme(name: ThemeName): void {
	currentTheme = name;
	setActiveTheme(name);
	setUi(colorsFor(name));
	// Replace, never merge: a group the new theme omits would otherwise keep the
	// previous theme's color and render invisible when light/dark flips.
	for (const group of Object.keys(syntaxTheme)) delete syntaxTheme[group];
	Object.assign(syntaxTheme, THEMES[name].syntax);
}

export function setTransparency(on: boolean): void {
	transparent = on;
	setUi(colorsFor(currentTheme));
}
