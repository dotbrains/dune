import { resolvedTheme, type Config } from '../../core/config';
import {
	appearancePluginStatus,
	loadAppearancePlugins,
	type AppearancePluginLoad,
} from '../../core/localThemes';
import { loadLocalLspServers } from '../../core/plugins/localLspServers';
import { invalidateSyntaxStyle } from '../../languages/highlight';
import type { ServerSpec } from '../../lsp/servers';
import { setTheme } from '../../themes';

export function reloadAppearancePlugins(deps: {
	rootDir: string;
	config: Config;
	setAppearancePlugins: (load: AppearancePluginLoad) => void;
	setLspServers?: (servers: ServerSpec[]) => void;
	lsp?: { restart: () => boolean };
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
}) {
	const next = loadAppearancePlugins(
		deps.rootDir,
		undefined,
		deps.config.disabledAppearancePlugins,
	);
	deps.setAppearancePlugins(next);
	setTheme(resolvedTheme(deps.config, null));
	invalidateSyntaxStyle();
	const status = appearancePluginStatus(next.problems);
	if (deps.setLspServers) deps.setLspServers(loadLocalLspServers(deps.rootDir).servers);
	const restarted = deps.lsp?.restart() ?? false;
	if (status) deps.say(status.msg, status.tone);
	else deps.say(restarted ? `Reloaded plugins and restarted language servers` : `Reloaded plugins`);
}

export function summarizeAppearancePlugins(load: AppearancePluginLoad): string {
	const themeCount = load.themes.length;
	const iconCount = load.iconThemes.length;
	const pluginNames = load.plugins.map(
		(plugin) => `${plugin.disabled ? 'off ' : ''}${plugin.id} ${plugin.version}`,
	);
	const problemCount = load.problems.length;
	if (themeCount === 0 && iconCount === 0 && pluginNames.length === 0 && problemCount === 0) {
		return `No local plugins`;
	}
	const parts = [`${themeCount} theme${themeCount === 1 ? '' : 's'}`];
	parts.push(`${iconCount} icon theme${iconCount === 1 ? '' : 's'}`);
	if (pluginNames.length > 0) parts.push(pluginNames.join(', '));
	if (problemCount > 0) parts.push(`${problemCount} problem${problemCount === 1 ? '' : 's'}`);
	return `Local plugins: ${parts.join(', ')}`;
}
