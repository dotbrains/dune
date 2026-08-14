import { describe, expect, test } from 'bun:test';

import { styleIdForGroup } from '../src/languages/highlight';
import { allSegments } from './syntax';

/** What each group got painted on, as text, for a given filetype. */
async function painted(source: string, filetype: string) {
	const segments = await allSegments(source, filetype);
	const lines = source.split('\n');
	const byGroup = new Map<number, string[]>();
	for (const segment of segments) {
		const text = lines[segment.line]?.slice(segment.start, segment.end) ?? '';
		if (!text.trim()) continue;
		byGroup.set(segment.styleId, [...(byGroup.get(segment.styleId) ?? []), text]);
	}
	return (group: string) => {
		const styleId = styleIdForGroup(group);
		return styleId == null ? [] : (byGroup.get(styleId) ?? []);
	};
}

// `typescript`/`javascript` used to be OpenTUI's own bundled grammar. Its query
// gates identifier captures behind `#lua-match?` predicates the parser worker
// never evaluates, so a pattern meant to catch only capitalized/ALL_CAPS names
// matched every identifier instead — and the ALL_CAPS one, painted last, won
// the lot. Every plain variable in every .ts/.js file read in the constant
// colour. Both now point at the same vendored tsx grammar `typescriptreact`
// already used, whose query this repo owns and whose predicates it never relies on.
describe('typescript/javascript highlighting', () => {
	test('a plain identifier paints as a variable, not a constant', async () => {
		const group = await painted('const title = other\n', 'typescript');

		expect(group('variable')).toContain('title');
		expect(group('variable')).toContain('other');
		expect(group('constant')).not.toContain('title');
		expect(group('constant')).not.toContain('other');
	});

	test('the same holds for a plain .js file', async () => {
		const group = await painted('const title = other\n', 'javascript');

		expect(group('variable')).toContain('title');
		expect(group('constant')).not.toContain('title');
	});

	test('a declared function is a function, not a variable', async () => {
		const group = await painted('function go() { return 1 }\n', 'typescript');

		expect(group('function')).toContain('go');
	});

	test('member access reads as a property, not a plain variable', async () => {
		const group = await painted('const n = items.length\n', 'typescript');

		expect(group('variable.member')).toContain('length');
	});

	test('comparison and arithmetic tokens are operators', async () => {
		const group = await painted('const ok = items.length > 0 && a + b\n', 'typescript');

		expect(group('operator')).toContain('>');
		expect(group('operator')).toContain('+');
	});

	test('"in"/"instanceof"/"typeof" read as operator keywords', async () => {
		const group = await painted('for (const k in obj) { typeof k }\n', 'typescript');

		expect(group('keyword.operator')).toContain('in');
		expect(group('keyword.operator')).toContain('typeof');
	});
});
