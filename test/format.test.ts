import { expect, test } from 'bun:test';

import { formatArgs, formatterFor, runFormatter } from '../src/core/format';
import { fixture } from './helpers';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

test('formatter matching accepts comma-separated extension keys', () => {
	const formatters = {
		'ts, tsx': ['fmt-ts'],
		'*': ['fmt-any'],
	};

	expect(formatterFor('/tmp/a.TS', formatters)).toEqual(['fmt-ts']);
	expect(formatterFor('/tmp/a.tsx', formatters)).toEqual(['fmt-ts']);
	expect(formatterFor('/tmp/a.md', formatters)).toEqual(['fmt-any']);
	expect(formatterFor('/tmp/Makefile', formatters)).toEqual(['fmt-any']);
});

test('empty formatter commands disable that key', () => {
	expect(formatterFor('/tmp/a.ts', { ts: [] })).toBeNull();
});

test('formatter args append or replace the edited path', () => {
	expect(formatArgs(['fmt', '--write'], '/tmp/a.ts')).toEqual(['--write', '/tmp/a.ts']);
	expect(formatArgs(['fmt', '--stdin-filepath', '{}'], '/tmp/a.ts')).toEqual([
		'--stdin-filepath',
		'/tmp/a.ts',
	]);
	expect(formatArgs(['fmt', '--flag={}.tmp'], '/tmp/a.ts')).toEqual(['--flag=/tmp/a.ts.tmp']);
});

test('formatter process reports failures and missing binaries', () => {
	const dir = fixture({});
	const file = join(dir, 'a.ts');
	writeFileSync(file, 'one\n');
	const fail = join(dir, 'fail.js');
	writeFileSync(fail, "console.error('boom: bad syntax'); process.exit(2);\n");

	expect(runFormatter([process.execPath, fail], file, dir)).toBe('boom: bad syntax');
	expect(runFormatter(['definitely-not-a-dune-test-binary'], file, dir)).toBe(
		'definitely-not-a-dune-test-binary is not installed, or not on PATH',
	);
});

test('formatter process rewrites the target file', () => {
	const dir = fixture({});
	const file = join(dir, 'a.ts');
	const script = join(dir, 'upper.js');
	writeFileSync(file, 'one\n');
	writeFileSync(
		script,
		"import { readFileSync, writeFileSync } from 'node:fs';\nconst file = process.argv.at(-1);\nwriteFileSync(file, readFileSync(file, 'utf8').toUpperCase());\n",
	);
	chmodSync(script, 0o755);

	expect(runFormatter([process.execPath, script], file, dir)).toBeNull();
	expect(readFileSync(file, 'utf8')).toBe('ONE\n');
});
