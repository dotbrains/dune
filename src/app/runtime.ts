import { basename } from 'node:path';
import type { Accessor, Setter } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { saveConfig } from '../core/config';
import type { Config } from '../core/config';
import type { Tone } from '../ui/StatusBar';
import type { BufferState, BusyState, Prompt } from './types';

export function createAppRuntime(deps: {
	buffers: Record<string, BufferState>;
	busy: Accessor<BusyState>;
	config: Config;
	renderer: { destroy: () => void };
	setConfig: (patch: Partial<Config>) => void;
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

	const patchConfig = (patch: Partial<Config>) => {
		deps.setConfig(patch);
		saveConfig(unwrap(deps.config));
	};

	return { dirtyPaths, patchConfig, quit, say, whileFree };
}

export function selectedSingleLineText(renderer: {
	getSelection: () => { getSelectedText: () => string } | null;
}) {
	const text = renderer.getSelection()?.getSelectedText() ?? '';
	return text.includes('\n') ? '' : text;
}
