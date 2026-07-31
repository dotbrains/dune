import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import type { CompletionItem, Diagnostic, RpcMessage } from './protocol';
import { createDecoder, encodeMessage } from './transport';

const INITIALIZE_TIMEOUT_MS = 30_000;
const liveChildren = new Set<ChildProcess>();
let exitHookInstalled = false;

function trackChild(child: ChildProcess) {
	liveChildren.add(child);
	child.once('exit', () => liveChildren.delete(child));
	if (exitHookInstalled) return;
	exitHookInstalled = true;
	process.on('exit', () => {
		for (const live of liveChildren) {
			try {
				live.kill('SIGKILL');
			} catch {
				// The process may already be gone by the time Node exits.
			}
		}
	});
}

export interface LspClientOptions {
	command: string[];
	rootDir: string;
	onDiagnostics: (uri: string, diagnostics: Diagnostic[]) => void;
	onFail: (reason: string) => void;
}

interface PendingRequest {
	resolve: (result: unknown) => void;
	reject: (error: Error) => void;
}

export function spawnLspClient(options: LspClientOptions) {
	const [executable, ...args] = options.command;
	if (!executable) throw new Error('language server command is empty');
	const child = spawn(executable, args, {
		cwd: options.rootDir,
		stdio: ['pipe', 'pipe', 'ignore'],
	});
	trackChild(child);

	let state: 'starting' | 'ready' | 'dead' = 'starting';
	let disposed = false;
	let resolveProvider = false;
	let nextId = 1;
	const pending = new Map<number, PendingRequest>();
	const queued: RpcMessage[] = [];
	const versions = new Map<string, number>();

	const send = (message: RpcMessage) => {
		if (child.stdin?.writable) child.stdin.write(encodeMessage(message));
	};

	const request = (method: string, params?: unknown): Promise<unknown> =>
		new Promise((resolve, reject) => {
			const id = nextId++;
			pending.set(id, { resolve, reject });
			send({ jsonrpc: '2.0', id, method, params });
		});

	const notify = (method: string, params: unknown) => {
		const message: RpcMessage = { jsonrpc: '2.0', method, params };
		if (state === 'starting') queued.push(message);
		else if (state === 'ready') send(message);
	};

	const die = (reason: string | null) => {
		if (state === 'dead') return;
		state = 'dead';
		for (const waiter of pending.values()) waiter.reject(new Error(reason ?? 'disposed'));
		pending.clear();
		queued.length = 0;
		if (reason !== null && !disposed) options.onFail(reason);
	};

	const answerClientRequest = (message: RpcMessage) => {
		if (message.method === 'workspace/configuration') {
			const items = (message.params as { items?: unknown[] } | undefined)?.items ?? [];
			send({ jsonrpc: '2.0', id: message.id, result: items.map(() => null) });
			return;
		}
		if (
			message.method === 'client/registerCapability' ||
			message.method === 'client/unregisterCapability' ||
			message.method === 'window/workDoneProgress/create'
		) {
			send({ jsonrpc: '2.0', id: message.id, result: null });
			return;
		}
		send({
			jsonrpc: '2.0',
			id: message.id,
			error: { code: -32601, message: `method not found: ${message.method}` },
		});
	};

	const onMessage = (message: RpcMessage) => {
		if (message.method !== undefined && message.id != null) {
			answerClientRequest(message);
			return;
		}
		if (message.method === 'textDocument/publishDiagnostics') {
			const params = message.params as { uri: string; diagnostics?: Diagnostic[] };
			options.onDiagnostics(params.uri, params.diagnostics ?? []);
			return;
		}
		if (message.id == null) return;
		const id = Number(message.id);
		const waiter = pending.get(id);
		if (!waiter) return;
		pending.delete(id);
		if (message.error) waiter.reject(new Error(message.error.message));
		else waiter.resolve(message.result);
	};

	child.stdout?.on('data', createDecoder(onMessage));
	child.on('error', (error) => die(error.message));
	child.on('exit', () => die('exited'));

	const killNow = () => {
		try {
			child.kill('SIGKILL');
		} catch {
			// The process may already have exited.
		}
	};

	const initTimeout = setTimeout(() => {
		if (state !== 'starting') return;
		die('did not answer initialize');
		killNow();
	}, INITIALIZE_TIMEOUT_MS);
	initTimeout.unref?.();

	const rootUri = pathToFileURL(options.rootDir).href;
	void request('initialize', {
		processId: process.pid,
		rootUri,
		capabilities: {
			textDocument: {
				synchronization: { didSave: true },
				publishDiagnostics: {},
				completion: {
					completionItem: {
						snippetSupport: false,
						insertReplaceSupport: true,
						resolveSupport: { properties: ['additionalTextEdits'] },
					},
				},
			},
		},
		workspaceFolders: [{ uri: rootUri, name: 'workspace' }],
	})
		.then((result) => {
			if (state !== 'starting') return;
			const capabilities = (
				result as { capabilities?: { completionProvider?: { resolveProvider?: boolean } } } | null
			)?.capabilities;
			resolveProvider = capabilities?.completionProvider?.resolveProvider === true;
			send({ jsonrpc: '2.0', method: 'initialized', params: {} });
			state = 'ready';
			for (const message of queued) send(message);
			queued.length = 0;
		})
		.catch((error: unknown) => {
			die(error instanceof Error ? error.message : 'initialize failed');
		})
		.finally(() => clearTimeout(initTimeout));

	return {
		ready: () => state === 'ready',

		openDocument(path: string, languageId: string, text: string) {
			const uri = pathToFileURL(path).href;
			versions.set(uri, 1);
			notify('textDocument/didOpen', { textDocument: { uri, languageId, version: 1, text } });
		},

		changeDocument(path: string, text: string) {
			const uri = pathToFileURL(path).href;
			const version = (versions.get(uri) ?? 1) + 1;
			versions.set(uri, version);
			notify('textDocument/didChange', {
				textDocument: { uri, version },
				contentChanges: [{ text }],
			});
		},

		complete(path: string, position: { line: number; character: number }): Promise<unknown> {
			if (state !== 'ready') return Promise.resolve(null);
			return request('textDocument/completion', {
				textDocument: { uri: pathToFileURL(path).href },
				position,
			}).catch(() => null);
		},

		definition(path: string, position: { line: number; character: number }): Promise<unknown> {
			if (state !== 'ready') return Promise.resolve(null);
			return request('textDocument/definition', {
				textDocument: { uri: pathToFileURL(path).href },
				position,
			}).catch(() => null);
		},

		resolveCompletion(item: CompletionItem): Promise<CompletionItem | null> {
			if (state !== 'ready' || !resolveProvider) return Promise.resolve(null);
			return request('completionItem/resolve', item).then(
				(result) => result as CompletionItem | null,
				() => null,
			);
		},

		saveDocument(path: string) {
			notify('textDocument/didSave', { textDocument: { uri: pathToFileURL(path).href } });
		},

		closeDocument(path: string) {
			const uri = pathToFileURL(path).href;
			versions.delete(uri);
			notify('textDocument/didClose', { textDocument: { uri } });
		},

		dispose() {
			if (disposed) return;
			disposed = true;
			if (state === 'ready') {
				void request('shutdown').catch(() => {});
				send({ jsonrpc: '2.0', method: 'exit' });
			}
			die(null);
			if (child.exitCode === null) {
				const backstop = setTimeout(killNow, 500);
				backstop.unref?.();
				child.once('exit', () => clearTimeout(backstop));
			}
		},
	};
}

export type LspClient = ReturnType<typeof spawnLspClient>;
