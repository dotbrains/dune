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
import {
	downloadServer,
	hasNodeRuntime,
	installedCommand,
	installServer,
	SERVER_ROOT,
} from '../../lsp/install';
import { projectCommand } from '../../lsp/project';
import { isUnnecessary, severityOf } from '../../lsp/protocol';
import type { CompletionItem, Diagnostic, ProblemSeverity } from '../../lsp/protocol';
import { installHint, resolveServer, serverSpecs, type ServerSpec } from '../../lsp/servers';
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

export interface LspStatusRow {
	id: string;
	filetypes: string[];
	command: string;
	state: 'ready' | 'starting' | 'stopped' | 'disabled';
	problems: number;
}

const CHANGE_DEBOUNCE_MS = 150;
const DEPENDENCY_QUIET_MS = 2_000;

export function createAppLsp(deps: {
	rootDir: string;
	config: Config;
	say: (msg: string, tone?: StatusMessage['tone']) => void;
	setPrompt?: (prompt: Prompt) => void;
	servers?: () => readonly ServerSpec[];
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
			(resolved.install?.kind !== 'npm' && resolved.install?.kind !== 'download') ||
			!deps.config.lspAutoInstall ||
			!deps.setPrompt ||
			offered.has(resolved.id) ||
			(resolved.install.kind === 'npm' && !hasNodeRuntime())
		) {
			return false;
		}
		offered.add(resolved.id);
		deps.setPrompt({
			kind: 'installServer',
			id: resolved.id,
			name: resolved.command[0]!,
			install: resolved.install,
		});
		return true;
	};

	const availableServers = (): ServerSpec[] => serverSpecs(deps.servers?.() ?? []);

	const clientFor = (path: string): LspClient | null => {
		if (!deps.config.lsp) return null;
		const resolved = resolveServer(
			filetypeForPath(path),
			deps.config.lspServers,
			availableServers(),
		);
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

	let depsTimer: ReturnType<typeof setTimeout> | null = null;

	const dependenciesChanged = () => {
		if (!deps.config.lsp) return;
		if (depsTimer) clearTimeout(depsTimer);
		depsTimer = setTimeout(() => {
			depsTimer = null;
			if (restart()) deps.say('Dependencies changed — restarted language servers');
		}, DEPENDENCY_QUIET_MS);
	};

	const install = async (
		id: string,
		name: string,
		spec: NonNullable<ReturnType<typeof resolveServer>>['install'],
	) => {
		if (!spec || spec.kind === 'manual') return;
		deps.say(`Installing ${name}...`);
		const error =
			spec.kind === 'download'
				? await downloadServer(spec.url, name)
				: await installServer(spec.packages);
		if (error) return deps.say(`Could not install ${name}: ${error}`, 'error');
		if (!installedCommand([name])) {
			return deps.say(`Installed ${name}, but no ${name} appeared in ${SERVER_ROOT}`, 'error');
		}
		clients.delete(id);
		setGeneration((current) => current + 1);
		deps.say(`Installed ${name}`);
	};

	const statusRows = (): LspStatusRow[] =>
		availableServers().map((server) => {
			const override = deps.config.lspServers[server.id];
			const command = override ?? server.command;
			const client = clients.get(server.id);
			const state =
				!deps.config.lsp || command.length === 0
					? 'disabled'
					: client === undefined || client === null
						? 'stopped'
						: client.state() === 'ready'
							? 'ready'
							: client.state() === 'starting'
								? 'starting'
								: 'stopped';
			let count = 0;
			for (const path of Object.keys(problems)) {
				if (server.filetypes.includes(filetypeForPath(path) ?? '')) {
					count += problems[path]?.length ?? 0;
				}
			}
			return {
				id: server.id,
				filetypes: server.filetypes,
				command: command.join(' ') || 'disabled',
				state,
				problems: count,
			};
		});

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

	onCleanup(() => {
		if (depsTimer) clearTimeout(depsTimer);
		dispose();
	});

	return {
		problems,
		clearProblems,
		clientFor,
		complete,
		resolveCompletion,
		definition,
		generation,
		dependenciesChanged,
		install,
		statusRows,
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
