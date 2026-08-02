import type { Config } from '../../core/config';
import { fetchCatalog } from '../../core/market';
import type { Prompt } from '../types';
import { createAppLsp } from './index';
import type { ServerSpec } from '../../lsp/servers';

export function createServerPluginSuggester(deps: {
	config: Config;
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
}) {
	const suggested = new Set<string>();
	return (filetype: string) => {
		if (!deps.config.pluginUpdates || suggested.has(filetype)) return;
		suggested.add(filetype);
		void (async () => {
			const catalog = await fetchCatalog(deps.config.pluginRegistry);
			const plugin = catalog?.find((entry) => entry.provides.filetypes.includes(filetype));
			if (plugin) deps.say(`Install ${plugin.name} for ${filetype} language server`, 'info');
		})();
	};
}

export function createDuneAppLsp(deps: {
	rootDir: string;
	config: Config;
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
	setPrompt: (prompt: Prompt) => void;
	servers: () => readonly ServerSpec[];
}) {
	return createAppLsp({
		...deps,
		suggestServerPlugin: createServerPluginSuggester({ config: deps.config, say: deps.say }),
	});
}
