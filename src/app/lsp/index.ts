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
	availablePackageManagers,
	installedCommand,
	installServer,
	SERVER_ROOT,
} from '../../lsp/install';
import { projectCommand } from '../../lsp/project';
import { isUnnecessary, severityOf } from '../../lsp/protocol';
import type { CompletionItem, Diagnostic, ProblemSeverity } from '../../lsp/protocol';
import {
	installHint,
	resolveServers,
	serverSpecs,
	type ResolvedServer,
	type ServerSpec,
} from '../../lsp/servers';
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
	suggestServerPlugin?: (filetype: string) => void;
}) {
	const [problems, setProblems] = createStore<Record<string, Problem[]>>({});
	const [generation, setGeneration] = createSignal(0);
	const bySource = new Map<string, Map<string, Problem[]>>();
	const clients = new Map<string, LspClient | null>();
	const clientIds = new WeakMap<LspClient, string>();
	const offered = new Set<string>();
	let refreshPulls: ((serverId: string) => void) | null = null;

	const mergeProblems = (path: string) => {
		const sources = bySource.get(path);
		const merged = sources ? [...sources.values()].flat() : [];
		setProblems(
			path,
			merged.toSorted((a, b) => a.line - b.line || a.col - b.col),
		);
	};

	const onDiagnosticsFrom = (serverId: string) => (uri: string, diagnostics: Diagnostic[]) => {
		let path: string;
		try {
			path = fileURLToPath(uri);
		} catch {
			return;
		}
		const sources = bySource.get(path) ?? new Map<string, Problem[]>();
		sources.set(
			serverId,
			diagnostics.map((diagnostic) => ({
				path,
				line: diagnostic.range.start.line,
				col: diagnostic.range.start.character,
				endLine: diagnostic.range.end.line,
				endCol: diagnostic.range.end.character,
				severity: severityOf(diagnostic),
				unnecessary: isUnnecessary(diagnostic),
				message: diagnostic.message,
				source: diagnostic.source,
			})),
		);
		bySource.set(path, sources);
		mergeProblems(path);
	};

	const clearProblems = (path: string) => {
		bySource.delete(path);
		if (problems[path]?.length) setProblems(path, []);
	};

	const initializationOptionsFor = (id: string): unknown => {
		if (id !== 'typescript') return undefined;
		const tsdk = deps.config.typescriptTsdk.trim();
		return tsdk ? { tsserver: { path: tsdk } } : undefined;
	};

	const missingMessage = (resolved: ResolvedServer): string => {
		const name = resolved.command[0]!;
		return resolved.install
			? `LSP: ${name} not installed — ${installHint(resolved.install)}`
			: `LSP: ${name} is not installed, or not on PATH`;
	};

	const offerInstall = (resolved: ResolvedServer): boolean => {
		if (
			(resolved.install?.kind !== 'npm' && resolved.install?.kind !== 'download') ||
			!deps.config.lspAutoInstall ||
			!deps.setPrompt ||
			offered.has(resolved.id) ||
			(resolved.install.kind === 'npm' && availablePackageManagers().length === 0)
		) {
			return false;
		}
		offered.add(resolved.id);
		deps.setPrompt({
			kind: 'installServer',
			id: resolved.id,
			name: resolved.command[0]!,
			install: resolved.install,
			manager: resolved.install.kind === 'npm' ? availablePackageManagers()[0] : undefined,
		});
		return true;
	};

	const availableServers = (): ServerSpec[] => serverSpecs(deps.servers?.() ?? []);

	const spawnFor = (resolved: ResolvedServer): LspClient | null => {
		const known = clients.get(resolved.id);
		if (known !== undefined) return known;
		const project = projectCommand(resolved.id, resolved.command, deps.rootDir);
		const fetched = project ? null : installedCommand(resolved.command);
		const command = project ?? fetched ?? resolved.command;
		const client = spawnLspClient({
			command,
			rootDir: deps.rootDir,
			initializationOptions: initializationOptionsFor(resolved.id),
			settings: resolved.settings,
			onDiagnostics: onDiagnosticsFrom(resolved.id),
			onRefreshDiagnostics: () => refreshPulls?.(resolved.id),
			onFail: (reason, missing) => {
				clients.set(resolved.id, null);
				if (missing && offerInstall(resolved)) return;
				deps.say(missing ? missingMessage(resolved) : `LSP: ${command[0]} ${reason}`, 'warn');
			},
		});
		clients.set(resolved.id, client);
		clientIds.set(client, resolved.id);
		return client;
	};

	const clientsFor = (path: string): LspClient[] => {
		if (!deps.config.lsp) return [];
		const filetype = filetypeForPath(path);
		const resolved = resolveServers(filetype, deps.config.lspServers, availableServers());
		if (resolved.length === 0) {
			if (filetype) deps.suggestServerPlugin?.(filetype);
			return [];
		}
		return resolved.flatMap((server) => {
			const client = spawnFor(server);
			return client ? [client] : [];
		});
	};

	const clientFor = (path: string): LspClient | null => clientsFor(path)[0] ?? null;

	const dispose = () => {
		for (const client of clients.values()) client?.dispose();
		clients.clear();
		bySource.clear();
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
		spec: ResolvedServer['install'],
		manager?: Parameters<typeof installServer>[2],
	) => {
		if (!spec || spec.kind === 'manual') return;
		deps.say(`Installing ${name}...`);
		const error =
			spec.kind === 'download'
				? await downloadServer(spec.url, name)
				: await installServer(spec.packages, SERVER_ROOT, manager);
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
			for (const sources of bySource.values()) {
				count += sources.get(server.id)?.length ?? 0;
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
		flushEdit?.(path);
		for (const client of clientsFor(path)) {
			if (!client.ready()) continue;
			const reply = normalizeCompletion(await client.complete(path, { line, character: col }));
			if (reply && reply.items.length > 0) return reply;
		}
		return null;
	};

	const resolveCompletion = async (
		path: string,
		item: CompletionItem,
	): Promise<CompletionItem | null> => {
		if (!deps.config.lsp || !deps.config.lspCompletion) return null;
		for (const client of clientsFor(path)) {
			if (!client.ready()) continue;
			const resolved = await client.resolveCompletion(item);
			if (resolved) return resolved;
		}
		return null;
	};

	const definition = async (
		path: string,
		line: number,
		col: number,
	): Promise<DefinitionTarget | null> => {
		if (!deps.config.lsp) return null;
		flushEdit?.(path);
		for (const client of clientsFor(path)) {
			if (!client.ready()) continue;
			const target = normalizeDefinition(await client.definition(path, { line, character: col }));
			if (target) return target;
		}
		return null;
	};

	onCleanup(() => {
		if (depsTimer) clearTimeout(depsTimer);
		dispose();
	});

	return {
		problems,
		clearProblems,
		clientFor,
		clientsFor,
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
		setRefreshPulls: (refresh: (serverId: string) => void) => {
			refreshPulls = refresh;
		},
		dispose,
		serverIdFor: (client: LspClient) => clientIds.get(client) ?? null,
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
		clients: Map<LspClient, { text: string; dirty: boolean }>;
	}

	const synced = new Map<string, Synced>();
	const pendingEdits = new Map<
		string,
		Map<LspClient, { state: { text: string; dirty: boolean }; text: string }>
	>();
	let flushTimer: ReturnType<typeof setTimeout> | null = null;

	const flushEdit = (path: string) => {
		const edit = pendingEdits.get(path);
		if (!edit) return;
		pendingEdits.delete(path);
		for (const [client, pending] of edit) {
			client.changeDocument(path, pending.text);
			pending.state.text = pending.text;
			client.pullDiagnostics(path);
		}
	};

	deps.lsp.setFlushEdit(flushEdit);
	deps.lsp.setRefreshPulls((serverId) => {
		for (const [path, entry] of synced) {
			for (const [client, state] of entry.clients) {
				if (deps.lsp.serverIdFor(client) !== serverId) continue;
				flushEdit(path);
				client.pullDiagnostics(path);
				state.dirty = deps.buffers[path]?.dirty ?? state.dirty;
			}
		}
	});

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
			for (const client of entry.clients.keys()) client.closeDocument(path);
			synced.delete(path);
			deps.lsp.clearProblems(path);
		}

		for (const path of open) {
			const buffer = deps.buffers[path];
			if (!buffer) continue;
			const entry = synced.get(path) ?? { clients: new Map() };
			const current = new Set(deps.lsp.clientsFor(path));
			for (const client of entry.clients.keys()) {
				if (current.has(client)) continue;
				client.closeDocument(path);
				entry.clients.delete(client);
			}
			for (const client of current) {
				let state = entry.clients.get(client);
				if (!state) {
					state = { text: buffer.content, dirty: buffer.dirty };
					entry.clients.set(client, state);
					client.openDocument(path, filetypeForPath(path) ?? 'plaintext', buffer.content);
					client.pullDiagnostics(path);
					continue;
				}
				if (buffer.content !== state.text) {
					const edits = pendingEdits.get(path) ?? new Map();
					edits.set(client, { state, text: buffer.content });
					pendingEdits.set(path, edits);
					if (!flushTimer) flushTimer = setTimeout(flushAll, CHANGE_DEBOUNCE_MS);
				}
				if (state.dirty && !buffer.dirty) {
					flushEdit(path);
					client.saveDocument(path);
					client.pullDiagnostics(path);
				}
				state.dirty = buffer.dirty;
			}
			if (entry.clients.size > 0) synced.set(path, entry);
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
