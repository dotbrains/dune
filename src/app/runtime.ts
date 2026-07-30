import { basename } from 'node:path';
import type { Accessor, Setter } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { resolveConfig, saveConfig, saveProjectConfig } from '../core/config';
import type { Config } from '../core/config';
import type { Tone } from '../ui/StatusBar';
import type { BufferState, BusyState, Prompt } from './types';

export function createAppRuntime(deps: {
	buffers: Record<string, BufferState>;
	busy: Accessor<BusyState>;
	rootDir: string;
	userConfig: Config;
	projectConfig: Partial<Config>;
	config: Config;
	renderer: { destroy: () => void };
	setConfig: (patch: Partial<Config>) => void;
	setUserConfig: (patch: Partial<Config>) => void;
	setProjectConfig: (patch: Partial<Config>) => void;
	setPrompt: Setter<Prompt>;
	setStatus: Setter<{ msg: string; tone: Tone }>;
}) {
	const dirtyPaths = () =>
		Object.keys(unwrap(deps.buffers)).filter((path) => deps.buffers[path]?.dirty);

	const quit = (discardUnsaved = false) => {
		const dirty = dirtyPaths();
		if (!discardUnsaved && dirty.length > 0) {
			return deps.setPrompt({ kind: 'quitDirty', names: dirty.map((path) => basename(path)) });
		}
		deps.renderer.destroy();
		process.exit(0);
	};

	const say = (msg: string, tone: Tone = 'info') => deps.setStatus({ msg, tone });

	const whileFree = (run: () => void) => {
		const running = deps.busy();
		if (running) return say(`${running.label} already — let it finish`, 'warn');
		run();
	};

	const patchConfig = (patch: Partial<Config>, scope: 'user' | 'project' = 'user') => {
		if (scope === 'project') {
			deps.setProjectConfig(patch);
			const project = { ...unwrap(deps.projectConfig), ...patch };
			deps.setConfig(resolveConfig(unwrap(deps.userConfig), project));
			saveProjectConfig(deps.rootDir, project);
			return;
		}
		deps.setUserConfig(patch);
		const user = { ...unwrap(deps.userConfig), ...patch };
		deps.setConfig(resolveConfig(user, unwrap(deps.projectConfig)));
		saveConfig(user);
	};

	return { dirtyPaths, patchConfig, quit, say, whileFree };
}

export function selectedSingleLineText(renderer: {
	getSelection: () => { getSelectedText: () => string } | null;
}) {
	const text = renderer.getSelection()?.getSelectedText() ?? '';
	return text.includes('\n') ? '' : text;
}
