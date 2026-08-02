import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { decodeText, encodeText } from '../src/core/fs';
import { fixture, launch, openFile, press } from './helpers';

const save = (t: Awaited<ReturnType<typeof launch>>) =>
	press(t, (input) => input.pressKey('s', { ctrl: true }));

describe('text encoding metadata', () => {
	test('CRLF comes off and goes back on', () => {
		const file = decodeText('a\r\nb\r\n');
		expect(file).toEqual({ content: 'a\nb\n', encoding: { eol: '\r\n', bom: false } });
		expect(encodeText(file.content, file.encoding)).toBe('a\r\nb\r\n');
	});

	test('a UTF-8 BOM comes off and goes back on', () => {
		const file = decodeText('\uFEFFclass A {}\n');
		expect(file).toEqual({ content: 'class A {}\n', encoding: { eol: '\n', bom: true } });
		expect(encodeText(file.content, file.encoding)).toBe('\uFEFFclass A {}\n');
	});

	test('mixed line endings keep the majority style', () => {
		expect(decodeText('a\nb\nc\r\n').encoding.eol).toBe('\n');
		expect(decodeText('a\r\nb\r\nc\n').encoding.eol).toBe('\r\n');
	});
});

describe('saving normalized text files', () => {
	test('a CRLF file is clean on open and saves back as CRLF', async () => {
		const dir = fixture({ 'crlf.ts': 'const a = 1\r\n' });
		const t = await launch(dir);
		await openFile(t, 'crlf.ts');

		expect(t.captureCharFrame()).not.toContain('●');
		await press(t, (input) => void input.typeText('X'));
		await save(t);
		expect(readFileSync(join(dir, 'crlf.ts'), 'utf8')).toBe('Xconst a = 1\r\n');
	}, 30000);

	test('a BOM file is clean on open and keeps the BOM on save', async () => {
		const dir = fixture({ 'bom.ts': '\uFEFFclass A {}\n' });
		const t = await launch(dir);
		await openFile(t, 'bom.ts');

		expect(t.captureCharFrame()).not.toContain('●');
		await save(t);
		expect(readFileSync(join(dir, 'bom.ts'), 'utf8')).toBe('\uFEFFclass A {}\n');
	}, 30000);
});
