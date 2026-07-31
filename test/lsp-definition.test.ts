import { expect, test } from 'bun:test';
import { pathToFileURL } from 'node:url';

import { normalizeDefinition } from '../src/lsp/definition';

test('normalizeDefinition accepts locations and location links', () => {
	const uri = pathToFileURL('/tmp/dune/def.ts').href;

	expect(
		normalizeDefinition({
			uri,
			range: { start: { line: 3, character: 4 }, end: { line: 3, character: 8 } },
		}),
	).toEqual({ path: '/tmp/dune/def.ts', line: 3, col: 4 });

	expect(
		normalizeDefinition([
			{
				targetUri: uri,
				targetRange: { start: { line: 1, character: 0 }, end: { line: 2, character: 0 } },
				targetSelectionRange: { start: { line: 2, character: 6 }, end: { line: 2, character: 10 } },
			},
		]),
	).toEqual({ path: '/tmp/dune/def.ts', line: 2, col: 6 });
});

test('normalizeDefinition rejects non-file targets', () => {
	expect(
		normalizeDefinition({
			uri: 'untitled:buffer',
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
		}),
	).toBeNull();
	expect(normalizeDefinition(null)).toBeNull();
});
