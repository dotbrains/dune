import type { RpcMessage } from './protocol';

export function encodeMessage(message: RpcMessage): Buffer {
	const body = Buffer.from(JSON.stringify(message), 'utf8');
	const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii');
	return Buffer.concat([header, body]);
}

export function createDecoder(
	onMessage: (message: RpcMessage) => void,
): (chunk: Buffer<ArrayBufferLike>) => void {
	let buffered: Buffer<ArrayBufferLike> = Buffer.alloc(0);
	let expectedLength: number | null = null;

	return (chunk) => {
		buffered = buffered.length === 0 ? chunk : Buffer.concat([buffered, chunk]);
		for (;;) {
			if (expectedLength === null) {
				const headerEnd = buffered.indexOf('\r\n\r\n');
				if (headerEnd < 0) return;
				const headers = buffered.subarray(0, headerEnd).toString('ascii');
				buffered = buffered.subarray(headerEnd + 4);
				const length = /content-length:\s*(\d+)/i.exec(headers)?.[1];
				if (!length) continue;
				expectedLength = Number(length);
			}
			if (buffered.length < expectedLength) return;
			const body = buffered.subarray(0, expectedLength);
			buffered = buffered.subarray(expectedLength);
			expectedLength = null;
			try {
				onMessage(JSON.parse(body.toString('utf8')) as RpcMessage);
			} catch {
				// A malformed server frame should not make every later frame unreadable.
			}
		}
	};
}
