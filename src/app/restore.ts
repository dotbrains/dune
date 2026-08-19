import { BinaryFileError, exists, mtimeOf, readTextFile } from '../core/fs';
import { isImagePath } from '../core/image';
import { isPdfPath } from '../core/pdf';
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
		if (isImagePath(single) || isPdfPath(single))
			return {
				buffers: {},
				tabs: [single],
				activePath: single,
				expanded: [],
				sidebar: false,
				failed: null,
			};
		try {
			const file = readTextFile(single);
			const buffer = {
				content: file.content,
				saved: file.content,
				dirty: false,
				mtime: mtimeOf(single),
				encoding: file.encoding,
			};
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
		if (isImagePath(path) || isPdfPath(path)) continue;
		try {
			const file = readTextFile(path);
			buffers[path] = {
				content: file.content,
				saved: file.content,
				dirty: false,
				mtime: mtimeOf(path),
				encoding: file.encoding,
			};
		} catch {}
	}
	const tabs = saved.tabs.filter(
		(path) => buffers[path] || ((isImagePath(path) || isPdfPath(path)) && exists(path)),
	);
	const activePath =
		saved.activePath && tabs.includes(saved.activePath) ? saved.activePath : (tabs[0] ?? null);
	return {
		buffers,
		tabs,
		activePath,
		expanded: saved.expanded,
		sidebar: saved.sidebar,
		failed: null,
	};
}
