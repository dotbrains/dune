import { basename, dirname, join } from 'node:path';

import { produce } from 'solid-js/store';

import { removeAll } from '../core/bulk';
import { formatterFor, parseFormatterEdit, runFormatter } from '../core/format';
import type { Config } from '../core/config';
import { createDir, createFile, exists, mtimeOf, readFile, writeFile } from '../core/fs';
import { trimTrailing } from '../editor/lines';
import { CLASH_CHANGED } from './constants';
import { isTextPrompt } from './prompts';
import type { BufferState, Conflict, DiskSync, Prompt } from './types';

export function createDocumentActions(deps: {
	config: {
		trimOnSave: boolean;
		formatOnSave: boolean;
		formatters: Record<string, string[]>;
	};
	buffers: Record<string, BufferState>;
	activePath: () => string | null;
	activeBuffer: () => BufferState | undefined;
	prompt: () => Prompt;
	conflict: () => Conflict | null;
	nodes: () => { path: string }[];
	tabs: () => string[];
	selectedPath: () => string | null;
	gitCommands: { submitCommit: (message: string) => void; undoCommit: () => void };
	closeTab: (path: string, discardUnsaved?: boolean) => void;
	expand: (path: string) => void;
	movePath: (from: string, to: string) => string | null;
	openFile: (path: string) => void;
	pinTab: (path: string) => void;
	quit: (discardUnsaved?: boolean) => void;
	refreshTree: () => void;
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
	setAnchor: (path: string | null) => void;
	setBuffers: (...args: unknown[]) => void;
	setBusy: (busy: { label: string; done: number; total: number } | null) => void;
	setConflict: (conflict: Conflict | null) => void;
	setFocus: (focus: 'tree' | 'editor') => void;
	setGitRevision: (update: (n: number) => number) => void;
	setGoto: (
		update: (prev: { line: number; col: number; key: number } | null) => {
			line: number;
			col: number;
			key: number;
		},
	) => void;
	setMarked: (paths: string[]) => void;
	setPrompt: (prompt: Prompt) => void;
	setReloadKey: (update: (n: number) => number) => void;
	setSelectedPath: (path: string | null) => void;
	pushEdit: (content: string) => void;
	patchConfig: (patch: Partial<Config>) => void;
	whileFree: (run: () => void) => void;
	rootDir: string;
}) {
	const writeBuffer = (path: string, content: string): boolean => {
		const final = deps.config.trimOnSave ? trimTrailing(content) : content;
		const err = writeFile(path, final);
		if (err) {
			deps.say(`Save failed: ${err}`, 'error');
			return false;
		}
		let saved = final;
		const formatter = deps.config.formatOnSave ? formatterFor(path, deps.config.formatters) : null;
		if (formatter) {
			const formatError = runFormatter(formatter, path, deps.rootDir);
			if (formatError) {
				deps.setBuffers(path, { content: final, dirty: false, mtime: mtimeOf(path) });
				if (final !== content && path === deps.activePath()) deps.pushEdit(final);
				deps.setGitRevision((n) => n + 1);
				deps.say(`Format failed: ${formatError}`, 'error');
				return true;
			}
			try {
				saved = readFile(path);
			} catch (e) {
				deps.say(`Format failed: ${(e as Error).message}`, 'error');
				saved = final;
			}
		}
		deps.setBuffers(path, { content: saved, dirty: false, mtime: mtimeOf(path) });
		if (saved !== content && path === deps.activePath()) deps.pushEdit(saved);
		deps.setGitRevision((n) => n + 1);
		deps.say(formatter ? `Formatted ${basename(path)}` : `Saved ${basename(path)}`);
		return true;
	};
	const saveActive = () => {
		const path = deps.activePath();
		const buffer = deps.activeBuffer();
		if (!path || !buffer) return;
		if (mtimeOf(path) !== buffer.mtime) {
			if (!exists(path)) return deps.setConflict({ path, disk: '', deleted: true });
			let disk = '';
			try {
				disk = readFile(path);
			} catch {}
			if (disk !== buffer.content) return deps.setConflict({ path, disk, deleted: false });
		}
		writeBuffer(path, buffer.content);
	};
	const saveDirtyPaths = (paths: string[]) => {
		const skipped: string[] = [];
		const failed: string[] = [];
		let saved = 0;
		for (const path of paths) {
			const buffer = deps.buffers[path]!;
			if (!buffer.dirty) continue;
			if (mtimeOf(path) !== buffer.mtime) {
				skipped.push(basename(path));
				continue;
			}
			if (writeBuffer(path, buffer.content)) saved++;
			else failed.push(basename(path));
		}
		if (saved > 1) deps.say(`Saved ${saved} files`);
		if (skipped.length > 0) deps.say(`${CLASH_CHANGED}${skipped.join(', ')}`, 'warn');
		if (failed.length > 0) deps.say(`Save failed: ${failed.join(', ')}`, 'error');
	};
	const saveDirtyOnBlur = () => saveDirtyPaths(Object.keys(deps.buffers));
	const resolveConflict = (choice: string) => {
		const c = deps.conflict();
		deps.setConflict(null);
		if (!c) return;
		if (choice === 'overwrite' && deps.buffers[c.path])
			writeBuffer(c.path, deps.buffers[c.path]!.content);
		else if (choice === 'reload') {
			deps.setBuffers(c.path, { content: c.disk, dirty: false, mtime: mtimeOf(c.path) });
			deps.setReloadKey((k) => k + 1);
			deps.say(`Reloaded ${basename(c.path)} from disk`);
		}
	};
	const onEditorChange = (text: string) => {
		const path = deps.activePath();
		if (!path || deps.buffers[path]?.content === text) return;
		deps.pinTab(path);
		deps.setBuffers(path, { content: text, dirty: true });
	};
	const syncFromDisk = (): DiskSync => {
		const updates: [string, BufferState][] = [];
		const changed: string[] = [];
		const deleted: string[] = [];
		const vanished: string[] = [];
		for (const path of Object.keys(deps.buffers)) {
			const buffer = deps.buffers[path]!;
			if (!exists(path)) {
				if (buffer.dirty) deleted.push(basename(path));
				else vanished.push(path);
				continue;
			}
			let disk: string;
			try {
				disk = readFile(path);
			} catch {
				continue;
			}
			if (disk === buffer.content) continue;
			if (buffer.dirty) changed.push(basename(path));
			else updates.push([path, { content: disk, dirty: false, mtime: mtimeOf(path) }]);
		}
		for (const path of vanished) deps.closeTab(path, true);
		if (updates.length > 0) {
			deps.setBuffers(
				produce((draft: Record<string, BufferState>) => {
					for (const [path, buffer] of updates) draft[path] = buffer;
				}),
			);
			deps.setReloadKey((k) => k + 1);
		}
		deps.refreshTree();
		return { changed, deleted };
	};
	const submitPrompt = (value: string) => {
		const name = value.trim();
		const p = deps.prompt();
		deps.setPrompt(null);
		if (!p || !isTextPrompt(p)) return;
		if (!name) return deps.say('Nothing entered', 'warn');
		if (p.kind === 'commitMessage') return deps.gitCommands.submitCommit(name);
		if (p.kind === 'formatterCommand') {
			const edit = parseFormatterEdit(name);
			if (!edit.ok) return deps.say(edit.error, 'error');
			const formatters = { ...deps.config.formatters };
			if (edit.command) {
				formatters[edit.key] = edit.command;
				deps.patchConfig({ formatters });
				return deps.say(`Formatter: ${edit.key} = ${edit.command.join(' ')}`);
			}
			delete formatters[edit.key];
			deps.patchConfig({ formatters });
			return deps.say(`Formatter for "${edit.key}" removed`);
		}
		if (p.kind === 'gotoLine') {
			const asked = Number.parseInt(name, 10);
			if (!Number.isInteger(asked) || asked < 1)
				return deps.say(`Not a line number: ${name}`, 'error');
			const total = deps.activeBuffer()?.content.split('\n').length ?? 1;
			const line = Math.min(asked, total);
			deps.setGoto((prev) => ({ line: line - 1, col: 0, key: (prev?.key ?? 0) + 1 }));
			deps.setFocus('editor');
			return deps.say(line === asked ? `Line ${line}` : `Line ${line} — the file ends there`);
		}
		if (p.kind === 'newFile') {
			const path = join(p.dir, name);
			const err = createFile(path);
			if (err) return deps.say(err, 'error');
			deps.expand(p.dir);
			deps.openFile(path);
			return deps.say(`Created ${name}`);
		}
		if (p.kind === 'newFolder') {
			const path = join(p.dir, name);
			const err = createDir(path);
			if (err) return deps.say(err, 'error');
			deps.expand(path);
			deps.setSelectedPath(path);
			return deps.say(`Created ${name}/`);
		}
		if (p.kind === 'rename') {
			const err = deps.movePath(p.target, join(dirname(p.target), name));
			if (err) return deps.say(err, 'error');
			deps.say(`Renamed to ${name}`);
		}
	};
	const confirmPrompt = () => {
		const p = deps.prompt();
		deps.setPrompt(null);
		switch (p?.kind) {
			case 'delete': {
				for (const target of p.targets)
					if (deps.tabs().includes(target)) deps.closeTab(target, true);
				const gone = deps.selectedPath();
				const wasAt =
					gone && p.targets.includes(gone) ? deps.nodes().findIndex((n) => n.path === gone) : -1;
				deps.setMarked([]);
				deps.setAnchor(null);
				const targets = p.targets;
				deps.whileFree(
					() =>
						void (async () => {
							deps.setBusy({ label: 'Deleting', done: 0, total: 0 });
							const { failed } = await removeAll(targets, (progress) =>
								deps.setBusy({ label: 'Deleting', done: progress.done, total: progress.total }),
							);
							deps.setBusy(null);
							deps.refreshTree();
							if (wasAt >= 0)
								deps.setSelectedPath(
									deps.nodes()[Math.min(wasAt, deps.nodes().length - 1)]?.path ?? null,
								);
							if (failed.length > 0)
								return deps.say(`Could not delete ${failed.join(', ')}`, 'error');
							deps.say(
								targets.length === 1
									? `Deleted ${basename(targets[0]!)}`
									: `Deleted ${targets.length} items`,
							);
						})(),
				);
				return;
			}
			case 'closeDirty':
				for (const path of p.paths) deps.closeTab(path, true);
				return deps.say(`Discarded unsaved edits in ${p.names.join(', ')}`, 'warn');
			case 'quitDirty':
				return deps.quit(true);
			case 'undoCommit':
				return deps.gitCommands.undoCommit();
		}
	};
	return {
		onEditorChange,
		resolveConflict,
		saveActive,
		saveDirtyOnBlur,
		saveDirtyPaths,
		submitPrompt,
		confirmPrompt,
		syncFromDisk,
	};
}
