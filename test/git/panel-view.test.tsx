import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { git as runGit } from '../git-fixture';
import { launch, press } from '../helpers';

const ESC = String.fromCharCode(27);

function repo(committed: string) {
	const dir = mkdtempSync(join(tmpdir(), 'dune-git-panel-'));
	const git = (...args: string[]) => runGit(dir, ...args);
	git('init', '-q', '-b', 'main');
	git('config', 'user.email', 'test@example.com');
	git('config', 'user.name', 'Test');
	writeFileSync(join(dir, 'a.ts'), committed);
	git('add', '.');
	git('commit', '-q', '-m', 'init');
	return dir;
}

test('source control panel can show a flat changed-files list', async () => {
	const dir = repo('one\n');
	mkdirSync(join(dir, 'src'));
	writeFileSync(join(dir, 'src/a.ts'), 'a\n');
	writeFileSync(join(dir, 'src/b.ts'), 'b\n');

	const t = await launch(dir, { gitPanelView: 'list' });
	await press(t, (input) => void input.pressKeys([`${ESC}${String.fromCharCode(7)}`]));

	const frame = t.captureCharFrame();
	expect(frame).toContain('src/a.ts');
	expect(frame).toContain('src/b.ts');
	expect(frame).not.toContain('←→ fold');
});
