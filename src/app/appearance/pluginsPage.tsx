import { createSignal, Show } from 'solid-js';
import type { Accessor } from 'solid-js';

import type { Config } from '../../core/config';
import type { AppearancePluginLoad } from '../../core/localThemes';
import { fetchPlugin, readCachedCatalog, removeFromDisk, writePlugin } from '../../core/market';
import { isNewer } from '../../core/update';
import type { Choice } from '../../ui/ChoiceModal';
import { AppearancePluginsView } from '../../ui/overlays/AppearancePluginsView';

export function appearancePluginChoices(appearance: AppearancePluginLoad): Choice[] {
	const installed = appearance.plugins;
	const installedById = new Map(installed.map((plugin) => [plugin.id, plugin]));
	const installedChoices = installed.map((plugin) => ({
		id: `installed:${plugin.id}`,
		label: `${plugin.disabled ? 'Enable' : 'Disable'} ${plugin.id} ${plugin.version}`,
	}));
	const marketChoices = (readCachedCatalog()?.plugins ?? []).map((plugin) => {
		const current = installedById.get(plugin.id);
		const action = current
			? isNewer(plugin.version, current.version)
				? 'Update'
				: 'Installed'
			: 'Install';
		return {
			id: `market:${plugin.id}`,
			label: `${action} ${plugin.name} ${plugin.version}`,
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
		{ id: 'reload:disk', label: 'Reload from disk' },
	];
}

export function pickAppearancePlugin(
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
	if (kind === 'reload') {
		deps.reload();
		return;
	}
	if (!id || kind === 'noop') {
		deps.say('Run Check appearance plugin market to refresh available plugins');
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
	reload: () => void;
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
}) {
	const [open, setOpen] = createSignal(false);
	return {
		open,
		choices: () => appearancePluginChoices(deps.appearance()),
		show: () => setOpen(true),
		close: () => setOpen(false),
		pick: (choice: string) =>
			pickAppearancePlugin(choice, {
				config: deps.config,
				patchConfig: deps.patchConfig,
				reload: deps.reload,
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
				choices={() => appearancePluginChoices(deps.appearance())}
				onPick={(choice) =>
					pickAppearancePlugin(choice, {
						config: deps.config,
						patchConfig: deps.patchConfig,
						reload: deps.reload,
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
