import { basename } from 'node:path';
import type { Accessor, Setter } from 'solid-js';
import type { SetStoreFunction } from 'solid-js/store';
import type { Config } from '../core/config';
import { BinaryFileError, mtimeOf, readTextFile } from '../core/fs';
import { isImagePath } from '../core/image';
import { isPdfPath } from '../core/pdf';
import { syncedBuffer } from './state/buffers';
import type { BufferState, Focus } from './types';

interface FileOpenDeps {
	activePath: Accessor<string | null>;
	buffers: Record<string, BufferState>;
	config: Config;
	previewPath: Accessor<string | null>;
	reveal: (path: string) => void;
	saveDirtyPathsRef: { run: (paths: string[]) => void };
	setActivePath: Setter<string | null>;
	setBuffers: SetStoreFunction<Record<string, BufferState>>;
	setFocus: Setter<Focus>;
	setNotice: Setter<{ name: string; reason: string } | null>;
	setPreviewPath: Setter<string | null>;
	setSelectedPath: Setter<string | null>;
	setTabs: Setter<string[]>;
	discardBuffer: (path: string) => void;
}

export function createFileOpener(deps: FileOpenDeps) {
	const openFile = (path: string, preview = false) => {
		const leaving = deps.activePath();
		deps.setNotice(null);
		const viewer = isImagePath(path) || isPdfPath(path);
		if (!deps.buffers[path] && !viewer) {
			try {
				const file = readTextFile(path);
				deps.setBuffers(path, syncedBuffer(file.content, mtimeOf(path), file.encoding));
			} catch (e) {
				deps.setNotice({
					name: basename(path),
					reason:
						e instanceof BinaryFileError
							? 'It is binary, or uses an encoding dune cannot read.'
							: (e as Error).message,
				});
				return;
			}
		}
		deps.setTabs((prev) => {
			if (prev.includes(path)) return prev;
			const slot = deps.previewPath() ? prev.indexOf(deps.previewPath()!) : -1;
			if (preview && slot >= 0) return prev.map((p, i) => (i === slot ? path : p));
			return [...prev, path];
		});
		if (preview) {
			const previous = deps.previewPath();
			if (previous && previous !== path) deps.discardBuffer(previous);
			deps.setPreviewPath(path);
		} else if (deps.previewPath() === path) {
			deps.setPreviewPath(null);
		}
		deps.reveal(path);
		deps.setSelectedPath(path);
		deps.setActivePath(path);
		if (deps.config.autoSaveOnBlur && leaving && leaving !== path && deps.buffers[leaving]?.dirty) {
			deps.saveDirtyPathsRef.run([leaving]);
		}
		deps.setFocus('editor');
	};
	const pinTab = (path: string) => {
		if (deps.previewPath() === path) deps.setPreviewPath(null);
	};
	return { openFile, pinTab };
}
