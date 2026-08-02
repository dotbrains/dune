import { createSignal, Show } from 'solid-js';
import type { Accessor } from 'solid-js';

import type { Config } from '../../core/config';
import type { AppearancePluginLoad } from '../../core/localThemes';
import {
	fetchCatalog,
	fetchPlugin,
	readCachedCatalog,
	removeFromDisk,
	updatesFor,
	writeCachedCatalog,
	writePlugin,
} from '../../core/market';
import { isNewer } from '../../core/update';
import type { Choice } from '../../ui/ChoiceModal';
import { AppearancePluginsView } from '../../ui/overlays/AppearancePluginsView';

export function appearancePluginChoices(
	appearance: AppearancePluginLoad,
	config?: Pick<Config, 'pluginRegistry' | 'pluginUpdates'>,
): Choice[] {
	const installed = appearance.plugins;
	const installedById = new Map(installed.map((plugin) => [plugin.id, plugin]));
	const cached = readCachedCatalog()?.plugins ?? [];
	const updates = updatesFor(installed, cached);
	const installedChoices = installed.map((plugin) => ({
		id: `installed:${plugin.id}`,
		label: [
			`${plugin.disabled ? 'Enable' : 'Disable'} ${plugin.id} ${plugin.version}`,
			plugin.name !== plugin.id ? plugin.name : '',
			plugin.detail,
		]
			.filter(Boolean)
			.join(' - '),
	}));
	const marketChoices = cached.flatMap((plugin) => {
		const current = installedById.get(plugin.id);
		if (current && !isNewer(plugin.version, current.version)) return [];
		const action = current ? 'Update' : 'Install';
		return {
			id: `market:${plugin.id}`,
			label: [action, plugin.name, plugin.version, plugin.description].filter(Boolean).join(' '),
		};
	});
	return [
		...installedChoices,
		...(installedChoices.length > 0 && marketChoices.length > 0
			? [{ id: 'noop:available', label: 'Available from cached market' }]
			: []),
		...marketChoices,
		...(installedChoices.length === 0 && marketChoices.length === 0
			? [{ id: 'noop:empty', label: 'No plugins listed; run Check appearance plugin market' }]
			: []),
		{
			id: 'market:check',
			label: [
				'Check appearance plugin market',
				cached.length > 0
					? updates.length === 0
						? 'up to date'
						: `${updates.length} waiting`
					: '',
			]
				.filter(Boolean)
				.join(' - '),
		},
		{
			id: 'market:update',
			label: ['Update all appearance plugins', updates.map((plugin) => plugin.name).join(', ')]
				.filter(Boolean)
				.join(' - '),
		},
		{ id: 'market:registry', label: `Edit market registry: ${config?.pluginRegistry ?? ''}` },
		...(config
			? [
					{
						id: 'market:toggle-updates',
						label: `${config.pluginUpdates ? 'Disable' : 'Enable'} startup update checks`,
					},
				]
			: []),
		{ id: 'reload:disk', label: 'Reload from disk' },
	];
}

export function pickAppearancePlugin(
	choice: string,
	deps: {
		config: Config;
		appearance: Accessor<AppearancePluginLoad>;
		patchConfig: (patch: Partial<Config>) => void;
		editRegistry: () => void;
		reload: () => void;
		refreshMarket: () => void;
		close: () => void;
		say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
	},
): void {
	const [kind, id] = choice.split(':', 2);
	if (kind === 'reload') {
		deps.reload();
		return;
	}
	if (!id || kind === 'noop') {
		deps.say('Run Check appearance plugin market to refresh available plugins');
		return;
	}
	if (kind === 'market' && id === 'toggle-updates') {
		deps.patchConfig({ pluginUpdates: !deps.config.pluginUpdates });
		deps.say(`Startup update checks ${deps.config.pluginUpdates ? 'disabled' : 'enabled'}`);
		deps.refreshMarket();
		return;
	}
	if (kind === 'market' && id === 'registry') {
		deps.close();
		deps.editRegistry();
		return;
	}
	if (kind === 'market' && id === 'check') {
		void (async () => {
			const catalog = await fetchCatalog(deps.config.pluginRegistry);
			if (!catalog) return deps.say('Could not reach appearance plugin market', 'warn');
			writeCachedCatalog(catalog, Date.now());
			deps.refreshMarket();
			deps.say(
				`Appearance plugin market: ${catalog.length} plugin${catalog.length === 1 ? '' : 's'}`,
			);
		})();
		return;
	}
	if (kind === 'market' && id === 'update') {
		void (async () => {
			const catalog = await fetchCatalog(deps.config.pluginRegistry);
			if (!catalog) return deps.say('Could not reach appearance plugin market', 'warn');
			writeCachedCatalog(catalog, Date.now());
			deps.refreshMarket();
			const updates = updatesFor(deps.appearance().plugins, catalog);
			if (updates.length === 0) return deps.say('Appearance plugins are up to date');
			const results = await Promise.all(
				updates.map(async (entry) => {
					const fetched = await fetchPlugin(entry.id, { registry: deps.config.pluginRegistry });
					const error = fetched.ok ? writePlugin(entry.id, fetched) : fetched.error;
					return { id: entry.id, ok: !error };
				}),
			);
			const updated = results.filter((result) => result.ok).length;
			const failed = results.filter((result) => !result.ok).map((result) => result.id);
			if (failed.length > 0) deps.say(`Could not update ${failed.join(', ')}`, 'error');
			if (updated > 0) {
				deps.reload();
				deps.say(`Updated ${updated} appearance plugin${updated === 1 ? '' : 's'}`);
			}
		})();
		return;
	}
	if (kind === 'installed') {
		const disabled = deps.config.disabledAppearancePlugins;
		const off = disabled.includes(id);
		deps.patchConfig({
			disabledAppearancePlugins: off ? disabled.filter((entry) => entry !== id) : [...disabled, id],
		});
		deps.reload();
		deps.close();
		deps.say(`Appearance plugin ${id} ${off ? 'enabled' : 'disabled'}`);
		return;
	}
	if (kind !== 'market') return;
	void (async () => {
		const fetched = await fetchPlugin(id, { registry: deps.config.pluginRegistry });
		if (!fetched.ok) return deps.say(`Plugin ${id}: ${fetched.error}`, 'error');
		const error = writePlugin(id, fetched);
		if (error) return deps.say(`Could not install ${id}: ${error}`, 'error');
		deps.reload();
		deps.close();
		deps.say(`Installed appearance plugin ${id} ${fetched.version}`);
	})();
}

export function deleteAppearancePlugin(
	choice: string,
	deps: {
		config: Config;
		patchConfig: (patch: Partial<Config>) => void;
		reload: () => void;
		close: () => void;
		say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
	},
): void {
	const [kind, id] = choice.split(':', 2);
	if (kind !== 'installed' || !id) return;
	const error = removeFromDisk(id);
	if (error) return deps.say(`Could not remove ${id}: ${error}`, 'error');
	deps.patchConfig({
		disabledAppearancePlugins: deps.config.disabledAppearancePlugins.filter(
			(entry) => entry !== id,
		),
	});
	deps.reload();
	deps.close();
	deps.say(`Removed appearance plugin ${id}`);
}

export function createAppearancePluginUi(deps: {
	config: Config;
	appearance: Accessor<AppearancePluginLoad>;
	patchConfig: (patch: Partial<Config>) => void;
	editRegistry: () => void;
	reload: () => void;
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
}) {
	const [open, setOpen] = createSignal(false);
	const [marketVersion, setMarketVersion] = createSignal(0);
	const refreshMarket = () => setMarketVersion((version) => version + 1);
	return {
		open,
		choices: () => {
			void marketVersion();
			return appearancePluginChoices(deps.appearance(), deps.config);
		},
		show: () => setOpen(true),
		close: () => setOpen(false),
		pick: (choice: string) =>
			pickAppearancePlugin(choice, {
				config: deps.config,
				appearance: deps.appearance,
				patchConfig: deps.patchConfig,
				editRegistry: deps.editRegistry,
				reload: deps.reload,
				refreshMarket,
				close: () => setOpen(false),
				say: deps.say,
			}),
		delete: (choice: string) =>
			deleteAppearancePlugin(choice, {
				config: deps.config,
				patchConfig: deps.patchConfig,
				reload: deps.reload,
				close: () => setOpen(false),
				say: deps.say,
			}),
		view: () => (
			<AppearancePluginOverlay
				open={open}
				choices={() => {
					void marketVersion();
					return appearancePluginChoices(deps.appearance(), deps.config);
				}}
				onPick={(choice) =>
					pickAppearancePlugin(choice, {
						config: deps.config,
						appearance: deps.appearance,
						patchConfig: deps.patchConfig,
						editRegistry: deps.editRegistry,
						reload: deps.reload,
						refreshMarket,
						close: () => setOpen(false),
						say: deps.say,
					})
				}
				onDelete={(choice) =>
					deleteAppearancePlugin(choice, {
						config: deps.config,
						patchConfig: deps.patchConfig,
						reload: deps.reload,
						close: () => setOpen(false),
						say: deps.say,
					})
				}
				onClose={() => setOpen(false)}
			/>
		),
	};
}

function AppearancePluginOverlay(props: {
	open: Accessor<boolean>;
	choices: Accessor<Choice[]>;
	onPick: (choice: string) => void;
	onDelete: (choice: string) => void;
	onClose: () => void;
}) {
	return (
		<Show when={props.open()}>
			<AppearancePluginsView
				choices={props.choices()}
				onPick={props.onPick}
				onDelete={props.onDelete}
				onClose={props.onClose}
			/>
		</Show>
	);
}
