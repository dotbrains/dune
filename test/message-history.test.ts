import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { recentCommitMessages } from '../src/core/git';
import { stepHistory } from '../src/core/messageHistory';
import { git } from './git-fixture';

const past = ['newest', 'older', 'oldest'];

test('Up walks back from the draft, Down walks out to it again', () => {
	const first = stepHistory(past, -1, 1, 'typing', '');
	expect(first).toEqual({ at: 0, value: 'newest', draft: 'typing' });

	const second = stepHistory(past, first!.at, 1, first!.value, first!.draft);
	expect(second).toEqual({ at: 1, value: 'older', draft: 'typing' });

	const back = stepHistory(past, second!.at, -1, second!.value, second!.draft);
	expect(back).toEqual({ at: 0, value: 'newest', draft: 'typing' });

	const out = stepHistory(past, back!.at, -1, back!.value, back!.draft);
	expect(out).toEqual({ at: -1, value: 'typing', draft: 'typing' });
});

test('a key with nowhere to go leaves the field alone', () => {
	expect(stepHistory([], -1, 1, 'typing', '')).toBeNull();
	// Already on the draft: Down is not a way to clear the field.
	expect(stepHistory(past, -1, -1, 'typing', '')).toBeNull();
	expect(stepHistory(past, 2, 1, 'oldest', 'typing')).toBeNull();
});

test('recentCommitMessages reads subjects newest first, deduplicated', () => {
	const dir = mkdtempSync(join(tmpdir(), 'dune-message-history-'));
	git(dir, 'init', '-q', '-b', 'main');
	git(dir, 'config', 'user.email', 'test@example.com');
	git(dir, 'config', 'user.name', 'Test');
	writeFileSync(join(dir, 'a.ts'), '1\n');
	git(dir, 'add', '.');
	git(dir, 'commit', '-q', '-m', 'init');
	git(dir, 'commit', '--allow-empty', '-q', '-m', 'wip');
	git(dir, 'commit', '--allow-empty', '-q', '-m', 'wip');
	git(dir, 'commit', '--allow-empty', '-q', '-m', 'second thoughts');

	expect(recentCommitMessages(dir)).toEqual(['second thoughts', 'wip', 'init']);
});
