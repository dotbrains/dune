import { detectAppearance } from '../../core/appearance';
import { resolveConfig, resolvedTheme } from '../../core/config';
import { loadLocalLspServers } from '../../core/localLspServers';
import { appearancePluginStatus, loadAppearancePlugins } from '../../core/localThemes';
import { setTheme, setTransparency } from '../../themes';
import { restoreAppState } from '../restore';
import type { AppProps } from '../types';

export function prepareStartup(props: AppProps) {
	const rootDir = props.rootDir;
	const restored = restoreAppState(rootDir, props.openFile ?? null);
	const initialConfig = resolveConfig(props.initialConfig, props.projectConfig ?? {});
	const appearancePlugins = loadAppearancePlugins(
		rootDir,
		undefined,
		initialConfig.disabledAppearancePlugins,
	);
	const lspServers = loadLocalLspServers(rootDir).servers;
	const pluginStatus = appearancePluginStatus(appearancePlugins.problems);
	const initialAppearance = detectAppearance();
	initialConfig.theme = resolvedTheme(initialConfig, initialAppearance);
	void (setTheme(initialConfig.theme), setTransparency(initialConfig.transparent));
	return {
		rootDir,
		restored,
		appearancePlugins,
		lspServers,
		pluginStatus,
		initialConfig,
		initialAppearance,
	};
}
