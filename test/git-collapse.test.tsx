import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { git } from './git-fixture';
import { launch, press, settle, until } from './helpers';

const ESC = String.fromCharCode(27);

function repo() {
	const dir = mkdtempSync(join(tmpdir(), 'dune-git-collapse-'));
	git(dir, 'init', '-q', '-b', 'main');
	git(dir, 'config', 'user.email', 'test@example.com');
	git(dir, 'config', 'user.name', 'Test');
	writeFileSync(join(dir, 'a.ts'), 'one\n');
	git(dir, 'add', '.');
	git(dir, 'commit', '-q', '-m', 'init');
	mkdirSync(join(dir, 'src/app'), { recursive: true });
	mkdirSync(join(dir, 'src/ui'), { recursive: true });
	writeFileSync(join(dir, 'src/app/one.ts'), 'changed\n');
	writeFileSync(join(dir, 'src/ui/two.ts'), 'changed\n');
	return dir;
}

test('source control panel can collapse every folder group', async () => {
	const t = await launch(repo(), {}, { width: 100, height: 24 });
	await press(t, (input) => void input.pressKeys([`${ESC}${String.fromCharCode(7)}`]));
	await until(t, () => t.captureCharFrame().includes('one.ts'));

	const lines = t.captureCharFrame().split('\n');
	const y = lines.findIndex((line) => line.includes('collapse'));
	const x = lines[y]?.indexOf('collapse') ?? -1;
	expect(y).toBeGreaterThan(0);
	expect(x).toBeGreaterThan(0);
	await t.mockMouse.click(x, y);
	await settle(t);

	const frame = t.captureCharFrame();
	expect(frame).toContain('src');
	expect(frame).not.toContain('one.ts');
	expect(frame).not.toContain('two.ts');
	expect(frame).not.toContain('collapse');
});
