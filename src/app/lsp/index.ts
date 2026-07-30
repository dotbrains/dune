import { fileURLToPath } from 'node:url';

import { createEffect, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';

import type { Config } from '../../core/config';
import { filetypeForPath } from '../../languages/highlight';
import { spawnLspClient } from '../../lsp/client';
import type { LspClient } from '../../lsp/client';
import { normalizeCompletion } from '../../lsp/completion';
import type { CompletionReply } from '../../lsp/completion';
import { isUnnecessary, severityOf } from '../../lsp/protocol';
import type { CompletionItem, Diagnostic, ProblemSeverity } from '../../lsp/protocol';
import { resolveServer } from '../../lsp/servers';
import type { BufferState, StatusMessage } from '../types';

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
}) {
	const [problems, setProblems] = createStore<Record<string, Problem[]>>({});
	const clients = new Map<string, LspClient | null>();

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

	const clientFor = (path: string): LspClient | null => {
		if (!deps.config.lsp) return null;
		const resolved = resolveServer(filetypeForPath(path), deps.config.lspServers);
		if (!resolved) return null;
		const known = clients.get(resolved.id);
		if (known !== undefined) return known;
		const client = spawnLspClient({
			command: resolved.command,
			rootDir: deps.rootDir,
			onDiagnostics,
			onFail: (reason) => {
				clients.set(resolved.id, null);
				deps.say(`LSP: ${resolved.command[0]} ${reason}`, 'warn');
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

	onCleanup(dispose);

	return {
		problems,
		clearProblems,
		clientFor,
		complete,
		resolveCompletion,
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
	};

	deps.lsp.setFlushEdit(flushEdit);

	const flushAll = () => {
		flushTimer = null;
		for (const path of pendingEdits.keys()) flushEdit(path);
	};

	createEffect(() => {
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
				synced.set(path, { client, text: buffer.content, dirty: buffer.dirty });
				continue;
			}

			if (buffer.content !== known.text) {
				pendingEdits.set(path, { entry: known, text: buffer.content });
				if (!flushTimer) flushTimer = setTimeout(flushAll, CHANGE_DEBOUNCE_MS);
			}
			if (known.dirty && !buffer.dirty) {
				flushEdit(path);
				known.client.saveDocument(path);
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
