import { describe, expect, test } from 'bun:test';

import { hasInfo, isDeprecated, itemInfo, plainMarkup } from '../src/lsp/completion';
import type { ItemInfo } from '../src/lsp/completion';
import { DOC_ROWS, layoutPanel } from '../src/ui/completionLayout';

describe('plainMarkup', () => {
	test('flattens the marks a doc comment carries', () => {
		expect(
			plainMarkup({
				kind: 'markdown',
				value: '# Title\n\nCalls **now** with `arg`.\n\n```ts\nfn()\n```\n\n- one\n- two',
			}),
		).toBe('Title\n\nCalls now with arg.\n\nfn()\n\n• one\n• two');
		expect(plainMarkup('plain text')).toBe('plain text');
		expect(plainMarkup(undefined)).toBe('');
	});
});

describe('itemInfo', () => {
	test('collapses a multi-line signature and reads both deprecation spellings', () => {
		expect(itemInfo({ label: 'a', detail: '(x: number)\n  => void' }).detail).toBe(
			'(x: number) => void',
		);
		// labelDetails is the fallback: the panel wants a signature either way.
		expect(itemInfo({ label: 'a', labelDetails: { detail: '(x)' } }).detail).toBe('(x)');
		expect(isDeprecated({ label: 'a', tags: [1] })).toBe(true);
		expect(isDeprecated({ label: 'a', deprecated: true })).toBe(true);
		expect(isDeprecated({ label: 'a' })).toBe(false);
	});

	test('reads the origin from labelDetails.description', () => {
		expect(itemInfo({ label: 'a', labelDetails: { description: 'node:fs' } }).source).toBe(
			'node:fs',
		);
		expect(itemInfo({ label: 'a' }).source).toBe('');
	});
});

describe('hasInfo', () => {
	test('is false until a detail or documentation arrives', () => {
		expect(hasInfo(null)).toBe(false);
		expect(hasInfo({ detail: '', documentation: '', source: '', deprecated: false })).toBe(false);
		expect(hasInfo({ detail: 'x', documentation: '', source: '', deprecated: false })).toBe(true);
		expect(hasInfo({ detail: '', documentation: 'x', source: '', deprecated: false })).toBe(true);
	});
});

describe('layoutPanel', () => {
	const info: ItemInfo = {
		detail: '(a: number) => void',
		documentation: 'Does a thing.',
		source: '',
		deprecated: false,
	};
	const ROOMY_WIDTH = 60;

	// Reserved regardless: the selected item resolves on its own round trip, and
	// a panel that only appeared once the reply landed would resize the box
	// under the cursor on every selection change.
	test('the room stays reserved before info has anything to show', () => {
		expect(layoutPanel(null, ROOMY_WIDTH, DOC_ROWS)).toEqual({
			panelRows: DOC_ROWS,
			signature: [],
			documentation: [],
			origin: '',
		});
	});

	test('holds the resolved lines', () => {
		const layout = layoutPanel(info, ROOMY_WIDTH, DOC_ROWS);
		expect(layout.signature).toEqual([{ text: '(a: number) => void', start: 0 }]);
		expect(layout.documentation).toEqual(['Does a thing.']);
		expect(layout.panelRows).toBe(DOC_ROWS);
	});

	// The panel paints from those offsets: the highlighter parses the signature
	// as one line, and a row of it is a slice of that line's captures.
	test('a wrapped signature keeps each row offset into the string it was cut from', () => {
		const long = 'const draw: <Value extends number>(props: Props<Value>) => Element';
		const layout = layoutPanel({ ...info, detail: long }, 20, DOC_ROWS);
		expect(layout.signature.length).toBeGreaterThan(1);
		for (const line of layout.signature) {
			expect(long.slice(line.start, line.start + line.text.length)).toBe(line.text);
		}
	});

	test('the signature grows into the rows the documentation left blank, capped at three when the documentation is long', () => {
		const wordy = { ...info, detail: 'word '.repeat(60).trim() };
		const layout = layoutPanel(wordy, ROOMY_WIDTH, DOC_ROWS);
		expect(layout.signature.length).toBeGreaterThan(3);
		expect(layout.signature.at(-1)!.text).not.toContain('…');
		// Long docs win the space back: the signature never starves them.
		const both = layoutPanel(
			{ ...wordy, documentation: 'doc. '.repeat(200) },
			ROOMY_WIDTH,
			DOC_ROWS,
		);
		expect(both.signature.length).toBe(3);
		expect(both.documentation.length).toBe(both.panelRows - 3);
	});

	test('the origin only fills a row the panel would have drawn blank', () => {
		const spare = layoutPanel({ ...info, source: 'dune/alpha' }, ROOMY_WIDTH, DOC_ROWS);
		expect(spare.origin).toBe('dune/alpha');
		const full = layoutPanel(
			{ ...info, documentation: 'doc. '.repeat(200), source: 'dune/alpha' },
			ROOMY_WIDTH,
			DOC_ROWS,
		);
		expect(full.origin).toBe('');
	});

	test('under two rows the panel is not worth the divider', () => {
		expect(layoutPanel(info, ROOMY_WIDTH, 1).panelRows).toBe(0);
	});

	test('a cut origin never overflows the panel width', () => {
		const layout = layoutPanel({ ...info, source: 'x'.repeat(200) }, ROOMY_WIDTH, DOC_ROWS);
		expect(layout.origin.length).toBeLessThanOrEqual(ROOMY_WIDTH - 3);
	});

	test('the box is the same size whatever the selected item resolved to', () => {
		// The size may not follow the selection: walking the list would resize the
		// popup under the cursor on every keystroke.
		const empty = layoutPanel(null, ROOMY_WIDTH, DOC_ROWS);
		const filled = layoutPanel(info, ROOMY_WIDTH, DOC_ROWS);
		const wordy = layoutPanel(
			{ detail: 'x '.repeat(200), documentation: 'y '.repeat(400), source: '', deprecated: false },
			ROOMY_WIDTH,
			DOC_ROWS,
		);
		expect(empty.panelRows).toBe(DOC_ROWS);
		expect(filled.panelRows).toBe(DOC_ROWS);
		expect(wordy.panelRows).toBe(DOC_ROWS);
	});
});
