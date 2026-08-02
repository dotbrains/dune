import type { Setter } from 'solid-js';

import { resolvedTheme, type Config } from '../../core/config';
import {
	appearancePluginStatus,
	loadAppearancePlugins,
	type AppearancePluginLoad,
} from '../../core/localThemes';
import { invalidateSyntaxStyle } from '../../languages/highlight';
import { setTheme } from '../../themes';

export function reloadAppearancePlugins(deps: {
	rootDir: string;
	config: Config;
	setAppearancePlugins: Setter<AppearancePluginLoad>;
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
}) {
	const next = loadAppearancePlugins(deps.rootDir);
	deps.setAppearancePlugins(next);
	setTheme(resolvedTheme(deps.config, null));
	invalidateSyntaxStyle();
	const status = appearancePluginStatus(next.problems);
	if (status) deps.say(status.msg, status.tone);
	else deps.say(`Reloaded appearance plugins`);
}
