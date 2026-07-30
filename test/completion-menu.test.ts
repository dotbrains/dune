import { expect, test } from 'bun:test';

import type { CompletionMatch } from '../src/lsp/completion';
import { kindInfo } from '../src/lsp/completion';
import { completionMenuWidth } from '../src/ui/CompletionMenu';

const match = (label: string, detail?: string): CompletionMatch => ({
	item: { label, detail },
	score: 0,
	positions: [],
});

test('completion item kinds map to stable menu groups', () => {
	expect(kindInfo(3)).toEqual({ glyph: 'ƒ', group: 'fn' });
	expect(kindInfo(6)).toEqual({ glyph: 'ν', group: 'var' });
	expect(kindInfo(7)).toEqual({ glyph: '◆', group: 'type' });
	expect(kindInfo(14)).toEqual({ glyph: 'κ', group: 'keyword' });
	expect(kindInfo(undefined)).toEqual({ glyph: '·', group: 'text' });
	expect(kindInfo(999)).toEqual({ glyph: '·', group: 'text' });
});

test('completion menu width accounts for labels and details within caps', () => {
	expect(completionMenuWidth([])).toBe(22);
	expect(completionMenuWidth([match('map')])).toBe(22);
	expect(
		completionMenuWidth([match('createLanguageServerClient', '(root: string) => Client')]),
	).toBe(58);
	expect(completionMenuWidth([match('x'.repeat(80), 'y'.repeat(80))])).toBe(76);
});
