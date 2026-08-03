import type { Config } from '../../core/config';
import { fetchCatalog, fetchPlugin } from '../../core/market';
import type { Prompt } from '../types';
import { createAppLsp } from './index';
import type { ServerSpec } from '../../lsp/servers';

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
	typeof raw === 'object' && raw !== null && !Array.isArray(raw);

function serverCommands(body: string): string[] {
	let raw: unknown;
	try {
		raw = JSON.parse(body);
	} catch {
		return [];
	}
	if (!isRecord(raw) || !Array.isArray(raw.languageServers)) return [];
	return raw.languageServers
		.map((server) =>
			isRecord(server) && Array.isArray(server.command)
				? server.command.filter((part) => typeof part === 'string' && part.length > 0).join(' ')
				: '',
		)
		.filter((command) => command.length > 0);
}

export function createServerPluginSuggester(deps: {
	config: Config;
	setPrompt: (prompt: Prompt) => void;
}) {
	const suggested = new Set<string>();
	return (filetype: string) => {
		if (!deps.config.pluginUpdates || suggested.has(filetype)) return;
		suggested.add(filetype);
		void (async () => {
			const catalog = await fetchCatalog(deps.config.pluginRegistry);
			const plugin = catalog?.find((entry) => entry.provides.filetypes.includes(filetype));
			if (plugin) {
				const fetched = await fetchPlugin(plugin.id, { registry: deps.config.pluginRegistry });
				deps.setPrompt({
					kind: 'installPlugin',
					id: plugin.id,
					name: plugin.name,
					reason: `No language server for ${filetype}`,
					commands: fetched.ok ? serverCommands(fetched.body) : [],
				});
			}
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
		suggestServerPlugin: createServerPluginSuggester({
			config: deps.config,
			setPrompt: deps.setPrompt,
		}),
	});
}
