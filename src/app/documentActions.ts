import { basename, dirname, join } from 'node:path';

import { produce } from 'solid-js/store';

import { removeAll } from '../core/bulk';
import { formatterFor, parseFormatterEdit, runFormatter } from '../core/format';
import { parseLspServerEdit } from '../core/lspSettings';
import { fetchPlugin, MARKET_URL, removeFromDisk, writePlugin } from '../core/market';
import { SIDEBAR_MAX, SIDEBAR_MIN } from '../core/config';
import type { Config } from '../core/config';
import { createDir, createFile, exists, mtimeOf, readTextFile, writeFile } from '../core/fs';
import {
	bindingProblem,
	chordId,
	formatChord,
	isDisabledShortcut,
	parseChord,
	parseKeybindingEdit,
} from '../core/keybindings';
import { trimTrailing } from '../editor/lines';
import type { PackageManager } from '../lsp/install';
import type { FetchableInstall } from '../lsp/servers';
import { ALT } from '../ui/keys';
import { installMarketPlugin } from './appearance/pluginsPage';
import { KEYBINDABLE_COMMANDS } from './commands/keybindings';
import { CLASH_CHANGED } from './constants';
import { isTextPrompt } from './prompts';
import type { BufferState, Conflict, DiskSync, Prompt } from './types';

export function createDocumentActions(deps: {
	config: Config;
	buffers: Record<string, BufferState>;
	activePath: () => string | null;
	activeBuffer: () => BufferState | undefined;
	prompt: () => Prompt;
	conflict: () => Conflict | null;
	nodes: () => { path: string }[];
	tabs: () => string[];
	selectedPath: () => string | null;
	gitCommands: {
		submitCommit: (message: string) => void;
		submitBranch: (name: string, from?: string | null) => void;
		rename: (from: string, to: string) => void;
		remove: (name: string, force: boolean) => void;
		merge: (name: string) => void;
		pullPush: (branch: string, hasUpstream: boolean) => void;
		undoCommit: () => void;
	};
	installLspServer: (
		id: string,
		name: string,
		install: FetchableInstall,
		manager?: PackageManager,
	) => void;
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
	reloadAppearancePlugins: () => void;
	whileFree: (run: () => void) => void;
	rootDir: string;
}) {
	const writeBuffer = async (path: string, content: string): Promise<boolean> => {
		const encoding = deps.buffers[path]?.encoding;
		const final = deps.config.trimOnSave ? trimTrailing(content) : content;
		const err = writeFile(path, final, encoding);
		if (err) {
			deps.say(`Save failed: ${err}`, 'error');
			return false;
		}
		let saved = final;
		const formatter = deps.config.formatOnSave ? formatterFor(path, deps.config.formatters) : null;
		if (formatter) {
			const formatError = await runFormatter(formatter, path, deps.rootDir);
			if (formatError) {
				deps.setBuffers(path, { content: final, dirty: false, mtime: mtimeOf(path), encoding });
				if (final !== content && path === deps.activePath()) deps.pushEdit(final);
				deps.setGitRevision((n) => n + 1);
				deps.say(`Format failed: ${formatError}`, 'error');
				return true;
			}
			try {
				const file = readTextFile(path);
				saved = file.content;
				deps.setBuffers(path, {
					content: saved,
					dirty: false,
					mtime: mtimeOf(path),
					encoding: file.encoding,
				});
				if (saved !== content && path === deps.activePath()) deps.pushEdit(saved);
				deps.setGitRevision((n) => n + 1);
				deps.say(`Formatted ${basename(path)}`);
				return true;
			} catch (e) {
				deps.say(`Format failed: ${(e as Error).message}`, 'error');
				saved = final;
			}
		}
		deps.setBuffers(path, { content: saved, dirty: false, mtime: mtimeOf(path), encoding });
		if (saved !== content && path === deps.activePath()) deps.pushEdit(saved);
		deps.setGitRevision((n) => n + 1);
		deps.say(formatter ? `Formatted ${basename(path)}` : `Saved ${basename(path)}`);
		return true;
	};
	const saveActive = async () => {
		const path = deps.activePath();
		const buffer = deps.activeBuffer();
		if (!path || !buffer) return;
		if (mtimeOf(path) !== buffer.mtime) {
			if (!exists(path)) return deps.setConflict({ path, disk: '', deleted: true });
			let disk = '';
			let encoding = buffer.encoding;
			try {
				const file = readTextFile(path);
				disk = file.content;
				encoding = file.encoding;
			} catch {}
			if (disk !== buffer.content)
				return deps.setConflict({ path, disk, encoding, deleted: false });
		}
		await writeBuffer(path, buffer.content);
	};
	const saveDirtyPaths = async (paths: string[]) => {
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
			if (await writeBuffer(path, buffer.content)) saved++;
			else failed.push(basename(path));
		}
		if (saved > 1) deps.say(`Saved ${saved} files`);
		if (skipped.length > 0) deps.say(`${CLASH_CHANGED}${skipped.join(', ')}`, 'warn');
		if (failed.length > 0) deps.say(`Save failed: ${failed.join(', ')}`, 'error');
	};
	const saveDirtyOnBlur = () => void saveDirtyPaths(Object.keys(deps.buffers));
	const resolveConflict = (choice: string) => {
		const c = deps.conflict();
		deps.setConflict(null);
		if (!c) return;
		if (choice === 'overwrite' && deps.buffers[c.path])
			void writeBuffer(c.path, deps.buffers[c.path]!.content);
		else if (choice === 'reload') {
			deps.setBuffers(c.path, {
				content: c.disk,
				dirty: false,
				mtime: mtimeOf(c.path),
				encoding: c.encoding,
			});
			deps.setReloadKey((k) => k + 1);
			deps.say(`Reloaded ${basename(c.path)} from disk`);
		}
	};
	const onEditorChange = (text: string) => {
		const path = deps.activePath();
		const buffer = path ? deps.buffers[path] : undefined;
		if (!path || !buffer || buffer.content === text) return;
		deps.pinTab(path);
		deps.setBuffers(path, { ...buffer, content: text, dirty: true });
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
			let encoding = buffer.encoding;
			try {
				const file = readTextFile(path);
				disk = file.content;
				encoding = file.encoding;
			} catch {
				continue;
			}
			if (disk === buffer.content) continue;
			if (buffer.dirty) changed.push(basename(path));
			else updates.push([path, { content: disk, dirty: false, mtime: mtimeOf(path), encoding }]);
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
		if (p.kind === 'commitMessage') return deps.gitCommands.submitCommit(name);
		if (p.kind === 'newBranch') return deps.gitCommands.submitBranch(name, p.from);
		if (p.kind === 'renameBranch') return deps.gitCommands.rename(p.from, name);
		if (p.kind === 'typescriptTsdk') {
			deps.patchConfig({ typescriptTsdk: name });
			return deps.say(name ? `TypeScript SDK: ${name}` : 'TypeScript SDK: server default');
		}
		if (p.kind === 'formatterCommand') {
			if (!name) return deps.say('Nothing entered', 'warn');
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
		if (p.kind === 'lspServerCommand') {
			if (!name) return deps.say('Nothing entered', 'warn');
			const edit = parseLspServerEdit(name);
			if (!edit.ok) return deps.say(edit.error, 'error');
			const lspServers = { ...deps.config.lspServers };
			if (edit.command?.length === 0) {
				lspServers[edit.id] = [];
				deps.patchConfig({ lspServers });
				return deps.say(`LSP: ${edit.id} disabled`);
			}
			if (edit.command) {
				lspServers[edit.id] = edit.command;
				deps.patchConfig({ lspServers });
				return deps.say(`LSP: ${edit.id} = ${edit.command.join(' ')}`);
			}
			delete lspServers[edit.id];
			deps.patchConfig({ lspServers });
			return deps.say(`LSP override for "${edit.id}" removed`);
		}
		if (p.kind === 'keybindingCommand') {
			if (!name) return deps.say('Nothing entered', 'warn');
			const edit = parseKeybindingEdit(name);
			if (!edit.ok) return deps.say(edit.error, 'error');
			const command = KEYBINDABLE_COMMANDS.find(
				(item) =>
					item.id === edit.command || item.label.toLowerCase() === edit.command.toLowerCase(),
			);
			if (!command) return deps.say(`Unknown shortcut command: ${edit.command}`, 'error');
			const keybindings = { ...deps.config.keybindings };
			if (!edit.shortcut) {
				delete keybindings[command.id];
				deps.patchConfig({ keybindings });
				return deps.say(`Shortcut removed for ${command.label}`);
			}
			if (isDisabledShortcut(edit.shortcut)) {
				keybindings[command.id] = 'none';
				deps.patchConfig({ keybindings });
				return deps.say(`Shortcut disabled for ${command.label}`);
			}
			const parsed = parseChord(edit.shortcut);
			if (!parsed) return deps.say(`Shortcut "${edit.shortcut}" is not valid`, 'error');
			const problem = bindingProblem(parsed);
			if (problem) return deps.say(problem, 'error');
			const id = chordId(parsed);
			const taken = Object.entries(keybindings).find(([otherCommand, otherShortcut]) => {
				if (otherCommand === command.id) return false;
				const other = parseChord(otherShortcut);
				return other ? chordId(other) === id : false;
			});
			if (taken) return deps.say(`${formatChord(parsed, ALT)} is already bound`, 'error');
			const shortcut = formatChord(parsed, ALT);
			keybindings[command.id] = shortcut;
			deps.patchConfig({ keybindings });
			return deps.say(`${shortcut} → ${command.label}`);
		}
		if (p.kind === 'sidebarWidth') {
			if (!name) return deps.say('Nothing entered', 'warn');
			if (name.toLowerCase() === 'auto') {
				deps.patchConfig({ sidebarWidth: 'auto' });
				return deps.say('Sidebar width: auto');
			}
			const width = Number.parseInt(name, 10);
			if (!Number.isInteger(width) || `${width}` !== name)
				return deps.say(`Not a sidebar width: ${name}`, 'error');
			if (width < SIDEBAR_MIN || width > SIDEBAR_MAX)
				return deps.say(`Sidebar width must be ${SIDEBAR_MIN}-${SIDEBAR_MAX}`, 'error');
			deps.patchConfig({ sidebarWidth: width });
			return deps.say(`Sidebar width: ${width}`);
		}
		if (p.kind === 'appearancePluginId') {
			if (!name) return deps.say('Nothing entered', 'warn');
			void (async () => {
				const fetched = await fetchPlugin(name, { registry: deps.config.pluginRegistry });
				if (!fetched.ok) return deps.say(`Plugin ${name}: ${fetched.error}`, 'error');
				const error = writePlugin(name, fetched);
				if (error) return deps.say(`Could not install ${name}: ${error}`, 'error');
				deps.reloadAppearancePlugins();
				deps.say(`Installed plugin ${name} ${fetched.version}`);
			})();
			return;
		}
		if (p.kind === 'appearancePluginRemoveId') {
			if (!name) return deps.say('Nothing entered', 'warn');
			const error = removeFromDisk(name);
			if (error) return deps.say(`Could not remove ${name}: ${error}`, 'error');
			deps.reloadAppearancePlugins();
			return deps.say(`Removed plugin ${name}`);
		}
		if (p.kind === 'appearancePluginRegistry') {
			const registry = name || MARKET_URL;
			if (!registry.startsWith('https://')) {
				return deps.say('Plugin registry must be an https URL', 'error');
			}
			deps.patchConfig({ pluginRegistry: registry });
			return deps.say(`Plugin registry: ${registry}`);
		}
		if (p.kind === 'gotoLine') {
			if (!name) return deps.say('Nothing entered', 'warn');
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
			if (!name) return deps.say('Nothing entered', 'warn');
			const path = join(p.dir, name);
			const err = createFile(path);
			if (err) return deps.say(err, 'error');
			deps.expand(p.dir);
			deps.openFile(path);
			return deps.say(`Created ${name}`);
		}
		if (p.kind === 'newFolder') {
			if (!name) return deps.say('Nothing entered', 'warn');
			const path = join(p.dir, name);
			const err = createDir(path);
			if (err) return deps.say(err, 'error');
			deps.expand(path);
			deps.setSelectedPath(path);
			return deps.say(`Created ${name}/`);
		}
		if (p.kind === 'rename') {
			if (!name) return deps.say('Nothing entered', 'warn');
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
			case 'deleteBranch':
				return deps.gitCommands.remove(p.name, p.force);
			case 'mergeBranch':
				return deps.gitCommands.merge(p.name);
			case 'pullPush':
				return deps.gitCommands.pullPush(p.branch, p.hasUpstream);
			case 'installServer':
				return deps.installLspServer(p.id, p.name, p.install, p.manager);
			case 'installPlugin':
				return void installMarketPlugin(p.id, {
					config: deps.config,
					reload: deps.reloadAppearancePlugins,
					say: deps.say,
				});
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
