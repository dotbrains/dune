import { BinaryFileError, mtimeOf, readFile } from '../core/fs';
import { loadSession } from '../core/session';
import type { BufferState } from './types';

export interface RestoredAppState {
	buffers: Record<string, BufferState>;
	tabs: string[];
	activePath: string | null;
	expanded: string[];
	sidebar: boolean;
	failed: string | null;
}

export function restoreAppState(rootDir: string, single: string | null): RestoredAppState {
	if (single) {
		try {
			const buffer = { content: readFile(single), dirty: false, mtime: mtimeOf(single) };
			return {
				buffers: { [single]: buffer },
				tabs: [single],
				activePath: single,
				expanded: [],
				sidebar: false,
				failed: null,
			};
		} catch (e) {
			return {
				buffers: {},
				tabs: [],
				activePath: null,
				expanded: [],
				sidebar: false,
				failed:
					e instanceof BinaryFileError
						? 'It is binary, or uses an encoding dune cannot read.'
						: (e as Error).message,
			};
		}
	}

	const saved = loadSession(rootDir);
	const buffers: Record<string, BufferState> = {};
	for (const path of saved.tabs) {
		try {
			buffers[path] = { content: readFile(path), dirty: false, mtime: mtimeOf(path) };
		} catch {}
	}
	const tabs = saved.tabs.filter((path) => buffers[path]);
	const activePath =
		saved.activePath && buffers[saved.activePath] ? saved.activePath : (tabs[0] ?? null);
	return {
		buffers,
		tabs,
		activePath,
		expanded: saved.expanded,
		sidebar: saved.sidebar,
		failed: null,
	};
}
