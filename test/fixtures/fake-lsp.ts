import type { CompletionItem, Diagnostic } from '../../src/lsp/protocol';
import { createDecoder, encodeMessage } from '../../src/lsp/transport';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const send = (message: object) => process.stdout.write(encodeMessage(message));

const publish = (uri: string, text: string) => {
	const diagnostics: Diagnostic[] = [];
	const lines = text.split('\n');
	for (let line = 0; line < lines.length; line++) {
		const col = lines[line]!.indexOf('oops');
		if (col < 0) continue;
		diagnostics.push({
			range: { start: { line, character: col }, end: { line, character: col + 4 } },
			severity: 1,
			message: 'found oops',
		});
	}
	send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri, diagnostics } });
};

const COMPLETIONS: CompletionItem[] = [
	{ label: 'duneAlpha', kind: 3, detail: '() => void', insertText: 'duneAlpha()' },
	{ label: 'duneBeta', kind: 6, detail: 'number' },
	{ label: 'duneLazy', kind: 7, detail: 'resolve-import' },
];

process.stdin.on(
	'data',
	createDecoder((message) => {
		if (message.method === 'initialize') {
			send({
				jsonrpc: '2.0',
				id: message.id,
				result: {
					capabilities: {
						textDocumentSync: 1,
						completionProvider: { triggerCharacters: ['.'], resolveProvider: true },
					},
				},
			});
		} else if (message.method === 'textDocument/completion') {
			send({ jsonrpc: '2.0', id: message.id, result: { isIncomplete: false, items: COMPLETIONS } });
		} else if (message.method === 'textDocument/definition') {
			send({
				jsonrpc: '2.0',
				id: message.id,
				result: [
					{
						targetUri: pathToFileURL(join(process.cwd(), 'def.ts')).href,
						targetRange: {
							start: { line: 0, character: 0 },
							end: { line: 1, character: 14 },
						},
						targetSelectionRange: {
							start: { line: 1, character: 6 },
							end: { line: 1, character: 10 },
						},
					},
				],
			});
		} else if (message.method === 'completionItem/resolve') {
			const item = message.params as CompletionItem;
			const result =
				item.label === 'duneLazy'
					? {
							...item,
							additionalTextEdits: [
								{
									range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
									newText: 'import { duneLazy } from "dune"\n',
								},
							],
						}
					: item;
			send({ jsonrpc: '2.0', id: message.id, result });
		} else if (message.method === 'shutdown') {
			send({ jsonrpc: '2.0', id: message.id, result: null });
		} else if (message.method === 'exit') {
			process.exit(0);
		} else if (message.method === 'textDocument/didOpen') {
			const params = message.params as { textDocument: { uri: string; text: string } };
			publish(params.textDocument.uri, params.textDocument.text);
		} else if (message.method === 'textDocument/didChange') {
			const params = message.params as {
				textDocument: { uri: string };
				contentChanges: { text: string }[];
			};
			publish(params.textDocument.uri, params.contentChanges[0]!.text);
		}
	}),
);

process.stdin.on('end', () => process.exit(0));
