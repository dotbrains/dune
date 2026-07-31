import { fileURLToPath } from 'node:url';

import { createEffect, createSignal, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';

import type { Config } from '../../core/config';
import { filetypeForPath } from '../../languages/highlight';
import { spawnLspClient } from '../../lsp/client';
import type { LspClient } from '../../lsp/client';
import { normalizeCompletion } from '../../lsp/completion';
import type { CompletionReply } from '../../lsp/completion';
import { normalizeDefinition } from '../../lsp/definition';
import type { DefinitionTarget } from '../../lsp/definition';
import { hasNodeRuntime, installedCommand, installServer, SERVER_ROOT } from '../../lsp/install';
import { projectCommand } from '../../lsp/project';
import { isUnnecessary, severityOf } from '../../lsp/protocol';
import type { CompletionItem, Diagnostic, ProblemSeverity } from '../../lsp/protocol';
import { installHint, resolveServer } from '../../lsp/servers';
import type { BufferState, Prompt, StatusMessage } from '../types';

export interface Problem {
	path: string;
	line: number;
	col: number;
	endLine: number;
	endCol: number;
	severity: ProblemSeverity;
	unnecessary: boolean;
	message: string;
	source?: string;
}

const CHANGE_DEBOUNCE_MS = 150;

export function createAppLsp(deps: {
	rootDir: string;
	config: Config;
	say: (msg: string, tone?: StatusMessage['tone']) => void;
	setPrompt?: (prompt: Prompt) => void;
}) {
	const [problems, setProblems] = createStore<Record<string, Problem[]>>({});
	const [generation, setGeneration] = createSignal(0);
	const clients = new Map<string, LspClient | null>();
	const offered = new Set<string>();

	const onDiagnostics = (uri: string, diagnostics: Diagnostic[]) => {
		let path: string;
		try {
			path = fileURLToPath(uri);
		} catch {
			return;
		}
		setProblems(
			path,
			diagnostics
				.map((diagnostic) => ({
					path,
					line: diagnostic.range.start.line,
					col: diagnostic.range.start.character,
					endLine: diagnostic.range.end.line,
					endCol: diagnostic.range.end.character,
					severity: severityOf(diagnostic),
					unnecessary: isUnnecessary(diagnostic),
					message: diagnostic.message,
					source: diagnostic.source,
				}))
				.toSorted((a, b) => a.line - b.line || a.col - b.col),
		);
	};

	const clearProblems = (path: string) => {
		if (problems[path]?.length) setProblems(path, []);
	};

	const initializationOptionsFor = (id: string): unknown => {
		if (id !== 'typescript') return undefined;
		const tsdk = deps.config.typescriptTsdk.trim();
		return tsdk ? { tsserver: { path: tsdk } } : undefined;
	};

	const missingMessage = (resolved: NonNullable<ReturnType<typeof resolveServer>>): string => {
		const name = resolved.command[0]!;
		return resolved.install
			? `LSP: ${name} not installed — ${installHint(resolved.install)}`
			: `LSP: ${name} is not installed, or not on PATH`;
	};

	const offerInstall = (resolved: NonNullable<ReturnType<typeof resolveServer>>): boolean => {
		if (
			resolved.install?.kind !== 'npm' ||
			!deps.config.lspAutoInstall ||
			!deps.setPrompt ||
			offered.has(resolved.id) ||
			!hasNodeRuntime()
		) {
			return false;
		}
		offered.add(resolved.id);
		deps.setPrompt({
			kind: 'installServer',
			id: resolved.id,
			name: resolved.command[0]!,
			packages: resolved.install.packages,
		});
		return true;
	};

	const clientFor = (path: string): LspClient | null => {
		if (!deps.config.lsp) return null;
		const resolved = resolveServer(filetypeForPath(path), deps.config.lspServers);
		if (!resolved) return null;
		const known = clients.get(resolved.id);
		if (known !== undefined) return known;
		const project = projectCommand(resolved.id, resolved.command, deps.rootDir);
		const fetched = project ? null : installedCommand(resolved.command);
		const command = project ?? fetched ?? resolved.command;
		const client = spawnLspClient({
			command,
			rootDir: deps.rootDir,
			initializationOptions: initializationOptionsFor(resolved.id),
			onDiagnostics,
			onFail: (reason, missing) => {
				clients.set(resolved.id, null);
				if (missing && offerInstall(resolved)) return;
				deps.say(missing ? missingMessage(resolved) : `LSP: ${command[0]} ${reason}`, 'warn');
			},
		});
		clients.set(resolved.id, client);
		return client;
	};

	const dispose = () => {
		for (const client of clients.values()) client?.dispose();
		clients.clear();
		for (const path of Object.keys(problems)) clearProblems(path);
	};

	const restart = (): boolean => {
		const running = clients.size > 0;
		dispose();
		setGeneration((current) => current + 1);
		return running;
	};

	const install = async (id: string, name: string, packages: string[]) => {
		deps.say(`Installing ${name}...`);
		const error = await installServer(packages);
		if (error) return deps.say(`Could not install ${name}: ${error}`, 'error');
		if (!installedCommand([name])) {
			return deps.say(`Installed ${name}, but no ${name} appeared in ${SERVER_ROOT}`, 'error');
		}
		clients.delete(id);
		setGeneration((current) => current + 1);
		deps.say(`Installed ${name}`);
	};

	let flushEdit: ((path: string) => void) | null = null;

	const complete = async (
		path: string,
		line: number,
		col: number,
	): Promise<CompletionReply | null> => {
		if (!deps.config.lsp || !deps.config.lspCompletion) return null;
		const client = clientFor(path);
		if (!client?.ready()) return null;
		flushEdit?.(path);
		return normalizeCompletion(await client.complete(path, { line, character: col }));
	};

	const resolveCompletion = (
		path: string,
		item: CompletionItem,
	): Promise<CompletionItem | null> => {
		if (!deps.config.lsp || !deps.config.lspCompletion) return Promise.resolve(null);
		const client = clientFor(path);
		if (!client?.ready()) return Promise.resolve(null);
		return client.resolveCompletion(item);
	};

	const definition = async (
		path: string,
		line: number,
		col: number,
	): Promise<DefinitionTarget | null> => {
		if (!deps.config.lsp) return null;
		const client = clientFor(path);
		if (!client?.ready()) return null;
		flushEdit?.(path);
		return normalizeDefinition(await client.definition(path, { line, character: col }));
	};

	onCleanup(dispose);

	return {
		problems,
		clearProblems,
		clientFor,
		complete,
		resolveCompletion,
		definition,
		generation,
		install,
		restart,
		setFlushEdit: (flush: (path: string) => void) => {
			flushEdit = flush;
		},
		dispose,
	};
}

export type AppLsp = ReturnType<typeof createAppLsp>;

export function wireAppLspEffects(deps: {
	lsp: AppLsp;
	config: Config;
	tabs: () => string[];
	buffers: Record<string, BufferState>;
}) {
	interface Synced {
		client: LspClient;
		text: string;
		dirty: boolean;
	}

	const synced = new Map<string, Synced>();
	const pendingEdits = new Map<string, { entry: Synced; text: string }>();
	let flushTimer: ReturnType<typeof setTimeout> | null = null;

	const flushEdit = (path: string) => {
		const edit = pendingEdits.get(path);
		if (!edit) return;
		pendingEdits.delete(path);
		edit.entry.client.changeDocument(path, edit.text);
		edit.entry.text = edit.text;
		edit.entry.client.pullDiagnostics(path);
	};

	deps.lsp.setFlushEdit(flushEdit);

	const flushAll = () => {
		flushTimer = null;
		for (const path of pendingEdits.keys()) flushEdit(path);
	};

	createEffect(() => {
		deps.lsp.generation();
		if (!deps.config.lsp) {
			pendingEdits.clear();
			synced.clear();
			deps.lsp.dispose();
			return;
		}

		const open = deps.tabs();
		const openSet = new Set(open);

		for (const [path, entry] of synced) {
			if (openSet.has(path)) continue;
			pendingEdits.delete(path);
			entry.client.closeDocument(path);
			synced.delete(path);
			deps.lsp.clearProblems(path);
		}

		for (const path of open) {
			const buffer = deps.buffers[path];
			if (!buffer) continue;
			const known = synced.get(path);
			if (!known) {
				const client = deps.lsp.clientFor(path);
				if (!client) continue;
				client.openDocument(path, filetypeForPath(path) ?? 'plaintext', buffer.content);
				client.pullDiagnostics(path);
				synced.set(path, { client, text: buffer.content, dirty: buffer.dirty });
				continue;
			}

			const current = deps.lsp.clientFor(path);
			if (!current) continue;
			if (current !== known.client) {
				current.openDocument(path, filetypeForPath(path) ?? 'plaintext', buffer.content);
				current.pullDiagnostics(path);
				synced.set(path, { client: current, text: buffer.content, dirty: buffer.dirty });
				continue;
			}

			if (buffer.content !== known.text) {
				pendingEdits.set(path, { entry: known, text: buffer.content });
				if (!flushTimer) flushTimer = setTimeout(flushAll, CHANGE_DEBOUNCE_MS);
			}
			if (known.dirty && !buffer.dirty) {
				flushEdit(path);
				known.client.saveDocument(path);
				known.client.pullDiagnostics(path);
			}
			known.dirty = buffer.dirty;
		}
	});

	onCleanup(() => {
		if (flushTimer) clearTimeout(flushTimer);
	});
}

export function problemFrom(
	list: readonly Problem[],
	line: number,
	col: number,
	direction: 1 | -1,
): Problem | null {
	if (list.length === 0) return null;
	const after = (problem: Problem) => problem.line - line || problem.col - col;
	if (direction === 1) return list.find((problem) => after(problem) > 0) ?? list[0]!;
	return list.findLast((problem) => after(problem) < 0) ?? list.at(-1)!;
}
