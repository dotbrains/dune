import { describe, expect, test } from 'bun:test';

import {
	conflictAt,
	conflictFrom,
	parseConflicts,
	resolveConflict,
} from '../../src/core/git/conflicts';

const CONFLICTED = [
	'const a = 1',
	'<<<<<<< HEAD',
	'const b = 2',
	'=======',
	'const b = 3',
	'>>>>>>> feature/x',
	'const c = 4',
	'',
].join('\n');

describe('merge conflict parsing', () => {
	test('finds complete blocks and side labels', () => {
		expect(parseConflicts(CONFLICTED)).toEqual([
			{ start: 1, base: null, separator: 3, end: 5, ours: 'HEAD', theirs: 'feature/x' },
		]);
	});

	test('ignores unterminated marker prose', () => {
		expect(parseConflicts('<<<<<<< HEAD\nours\n=======\ntheirs\n')).toEqual([]);
	});

	test('handles diff3 base sections', () => {
		const [conflict] = parseConflicts(
			'<<<<<<< HEAD\nours\n||||||| merged common ancestors\nbase\n=======\ntheirs\n>>>>>>> other\n',
		);
		expect(conflict?.base).toBe(2);
		expect(conflict?.separator).toBe(4);
	});
});

describe('merge conflict navigation', () => {
	const conflicts = parseConflicts(CONFLICTED + CONFLICTED);

	test('finds the conflict under the cursor', () => {
		expect(conflictAt(conflicts, 1)).toBe(conflicts[0]!);
		expect(conflictAt(conflicts, 0)).toBeNull();
	});

	test('walks conflicts with wraparound', () => {
		expect(conflictFrom(conflicts, 0, 1)).toBe(conflicts[0]!);
		expect(conflictFrom(conflicts, conflicts[1]!.start, 1)).toBe(conflicts[0]!);
		expect(conflictFrom(conflicts, 0, -1)).toBe(conflicts[1]!);
	});
});

describe('merge conflict resolution', () => {
	const [conflict] = parseConflicts(CONFLICTED);

	test('keeps the current side', () => {
		expect(resolveConflict(CONFLICTED, conflict!, 'ours')).toBe(
			'const a = 1\nconst b = 2\nconst c = 4\n',
		);
	});

	test('keeps the incoming side', () => {
		expect(resolveConflict(CONFLICTED, conflict!, 'theirs')).toBe(
			'const a = 1\nconst b = 3\nconst c = 4\n',
		);
	});

	test('keeps both sides in marker order', () => {
		expect(resolveConflict(CONFLICTED, conflict!, 'both')).toBe(
			'const a = 1\nconst b = 2\nconst b = 3\nconst c = 4\n',
		);
	});

	test('preserves CRLF outside the resolved block', () => {
		const text = 'a\r\n<<<<<<< HEAD\r\nours\r\n=======\r\ntheirs\r\n>>>>>>> other\r\nb\r\n';
		const [crlf] = parseConflicts(text);
		expect(resolveConflict(text, crlf!, 'ours')).toBe('a\r\nours\r\nb\r\n');
	});
});
