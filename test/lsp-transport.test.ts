import { describe, expect, test } from 'bun:test';

import type { RpcMessage } from '../src/lsp/protocol';
import { createDecoder, encodeMessage } from '../src/lsp/transport';

function collector() {
	const messages: RpcMessage[] = [];
	return {
		messages,
		accept: createDecoder((message) => messages.push(message)),
	};
}

describe('LSP transport framing', () => {
	test('decodes a frame that arrives one byte at a time', () => {
		const { messages, accept } = collector();
		const frame = encodeMessage({ jsonrpc: '2.0', method: 'ready', params: { ok: true } });
		for (const byte of frame) accept(Buffer.from([byte]));

		expect(messages).toEqual([{ jsonrpc: '2.0', method: 'ready', params: { ok: true } }]);
	});

	test('decodes multiple frames from one chunk', () => {
		const { messages, accept } = collector();
		accept(Buffer.concat([encodeMessage({ id: 1 }), encodeMessage({ id: 2 })]));

		expect(messages.map((message) => message.id)).toEqual([1, 2]);
	});

	test('counts UTF-8 bytes rather than string characters', () => {
		const { messages, accept } = collector();
		accept(encodeMessage({ method: 'text', params: { value: 'h\u00e9llo \u2605' } }));

		expect((messages[0]!.params as { value: string }).value).toBe('h\u00e9llo \u2605');
	});

	test('accepts lowercase content-length headers', () => {
		const { messages, accept } = collector();
		const body = Buffer.from('{"id":7}', 'utf8');
		accept(Buffer.concat([Buffer.from(`content-length: ${body.length}\r\n\r\n`), body]));

		expect(messages[0]!.id).toBe(7);
	});

	test('skips bad header and JSON frames without losing the next valid message', () => {
		const { messages, accept } = collector();
		const badJson = Buffer.from('{', 'utf8');
		accept(Buffer.concat([Buffer.from('X: 1\r\n\r\n'), encodeMessage({ id: 1 })]));
		accept(
			Buffer.concat([
				Buffer.from(`Content-Length: ${badJson.length}\r\n\r\n`),
				badJson,
				encodeMessage({ id: 2 }),
			]),
		);

		expect(messages.map((message) => message.id)).toEqual([1, 2]);
	});
});
