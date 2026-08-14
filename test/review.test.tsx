import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fetchComments, findPullRequest, forgeFor, tokenFor } from '../src/core/forge';
import type { Fetcher, ForgeTarget } from '../src/core/forge';
import { remoteUrl } from '../src/core/git';
import { loadNotes, saveNotes } from '../src/core/review';
import { fixture, launch, openFile, press, runCommand, settle } from './helpers';
import type { Harness } from './helpers';

// ── The forge layer ─────────────────────────────────────────────────────────

test('a remote names its forge in every spelling git writes one', () => {
	const cases: {
		url: string;
		forge: ForgeTarget['kind'];
		owner: string;
		repo: string;
		api: string;
	}[] = [
		{
			url: 'https://github.com/letstri/druk.git',
			forge: 'github',
			owner: 'letstri',
			repo: 'druk',
			api: 'https://api.github.com',
		},
		{
			url: 'git@github.com:letstri/druk.git',
			forge: 'github',
			owner: 'letstri',
			repo: 'druk',
			api: 'https://api.github.com',
		},
		{
			// An ssh port is not the web port, and a subgroup is part of the owner.
			url: 'ssh://git@gitlab.com:2222/team/sub/app.git',
			forge: 'gitlab',
			owner: 'team/sub',
			repo: 'app',
			api: 'https://gitlab.com/api/v4',
		},
		{
			url: 'https://codeberg.org/user/app',
			forge: 'gitea',
			owner: 'user',
			repo: 'app',
			api: 'https://codeberg.org/api/v1',
		},
		{
			url: 'git@bitbucket.org:team/app.git',
			forge: 'bitbucket',
			owner: 'team',
			repo: 'app',
			api: 'https://api.bitbucket.org/2.0',
		},
	];
	for (const { url, forge, owner, repo, api } of cases) {
		const target = forgeFor(url);
		expect(target.ok).toBe(true);
		if (!target.ok) continue;
		expect(target.value).toMatchObject({ kind: forge, owner, repo, api });
	}
});

test('a self-hosted host is refused until the setting names it', () => {
	const auto = forgeFor('git@code.example.com:team/app.git');
	expect(auto.ok).toBe(false);
	if (!auto.ok) expect(auto.error).toContain('reviewForge');

	const told = forgeFor('git@code.example.com:team/app.git', 'gitea');
	expect(told.ok).toBe(true);
	if (told.ok) expect(told.value.api).toBe('https://code.example.com/api/v1');
});

test('GitHub Enterprise keeps its own host, github.com does not', () => {
	const enterprise = forgeFor('https://github.acme.com/team/app.git');
	expect(enterprise.ok).toBe(true);
	if (enterprise.ok) expect(enterprise.value.api).toBe('https://github.acme.com/api/v3');
});

test('Bitbucket Server is refused rather than asked the wrong questions', () => {
	const server = forgeFor('https://bitbucket.acme.com/team/app.git', 'bitbucket');
	expect(server.ok).toBe(false);
	if (!server.ok) expect(server.error).toContain('Bitbucket Server');
});

test('the token comes from the forge’s own variable, or the generic one', () => {
	expect(tokenFor('github', { GITHUB_TOKEN: 'a' })).toBe('a');
	expect(tokenFor('gitlab', { DUNE_FORGE_TOKEN: 'b' })).toBe('b');
	// Another forge's variable is not this forge's token.
	expect(tokenFor('gitea', { GITHUB_TOKEN: 'a' })).toBe(null);
});

/** A fetcher answering a fixed map of URL substring → JSON body. */
function stub(routes: [string, unknown][], seen: string[] = []): Fetcher {
	return (url: string) => {
		seen.push(url);
		const hit = routes.find(([match]) => url.includes(match));
		return Promise.resolve(
			new Response(JSON.stringify(hit ? hit[1] : []), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			}),
		);
	};
}

const github = () => {
	const target = forgeFor('https://github.com/letstri/druk.git');
	if (!target.ok) throw new Error(target.error);
	return target.value;
};

test('GitHub: the open pull request for a branch, and everything said on it', async () => {
	const fetcher = stub([
		[
			'/pulls?state=open',
			[
				{ number: 3, title: 'Other', head: { ref: 'other' }, user: { login: 'a' } },
				{ number: 7, title: 'Review export', head: { ref: 'feat' }, user: { login: 'me' } },
			],
		],
		[
			'/pulls/7/comments',
			[
				{
					path: 'src/auth.ts',
					line: 49,
					body: 'expiry?',
					user: { login: 'peer' },
					html_url: 'https://x/1',
				},
				// The hunk is gone: `line` is null and the original stands in.
				{
					path: 'src/old.ts',
					line: null,
					original_line: 4,
					body: 'stale',
					user: { login: 'peer' },
					html_url: 'https://x/2',
				},
			],
		],
		[
			'/issues/7/comments',
			[{ body: 'ship it?', user: { login: 'boss' }, html_url: 'https://x/3' }],
		],
		// An approval with no body says nothing worth reading.
		['/pulls/7/reviews', [{ body: '', user: { login: 'boss' }, html_url: 'https://x/4' }]],
	]);

	const found = await findPullRequest(github(), 'feat', { fetcher, token: null });
	expect(found.ok).toBe(true);
	if (!found.ok || !found.value) throw new Error('no pull request');
	expect(found.value.number).toBe(7);

	const said = await fetchComments(github(), found.value, { fetcher, token: null });
	expect(said.ok).toBe(true);
	if (!said.ok) return;
	expect(said.value).toHaveLength(3);
	// 1-based on the wire, 0-based in dune.
	expect(said.value[0]).toMatchObject({ path: 'src/auth.ts', line: 48, outdated: false });
	expect(said.value[1]).toMatchObject({ line: 3, outdated: true });
	expect(said.value[2]).toMatchObject({ path: null, line: null, author: 'boss' });
});

test('GitLab: notes carry their diff position, and system notes are not feedback', async () => {
	const target = forgeFor('git@gitlab.com:team/sub/app.git');
	if (!target.ok) throw new Error(target.error);
	const seen: string[] = [];
	const fetcher = stub(
		[
			[
				'/merge_requests?',
				[
					{
						iid: 12,
						title: 'MR',
						source_branch: 'feat',
						author: { username: 'me' },
						web_url: 'https://gl/12',
					},
				],
			],
			[
				'/notes',
				[
					{ id: 1, system: true, body: 'assigned to @me', author: { username: 'me' } },
					{
						id: 2,
						system: false,
						body: 'rename this',
						author: { username: 'peer' },
						position: { new_path: 'src/a.ts', new_line: 10 },
					},
				],
			],
		],
		seen,
	);

	const found = await findPullRequest(target.value, 'feat', { fetcher, token: null });
	if (!found.ok || !found.value) throw new Error('no merge request');
	// The subgroup path is one URL-encoded project id, not two path segments.
	expect(seen[0]).toContain('/projects/team%2Fsub%2Fapp/merge_requests');

	const said = await fetchComments(target.value, found.value, { fetcher, token: null });
	if (!said.ok) throw new Error(said.error);
	expect(said.value).toHaveLength(1);
	expect(said.value[0]).toMatchObject({ path: 'src/a.ts', line: 9, author: 'peer' });
});

test('a forge that wants a token says which variable to set', async () => {
	const fetcher: Fetcher = () => Promise.resolve(new Response('{}', { status: 401 }));
	const found = await findPullRequest(github(), 'feat', { fetcher, token: null });
	expect(found.ok).toBe(false);
	if (!found.ok) expect(found.error).toContain('GITHUB_TOKEN');
});

// ── Notes, the export, and where they live ──────────────────────────────────

test('notes survive a restart, and clearing forgets the project', () => {
	const file = join(mkdtempSync(join(tmpdir(), 'dune-notes-')), 'review.json');
	const note = {
		id: 'a',
		path: '/p/src/a.ts',
		line: 4,
		endLine: 4,
		kind: 'issue' as const,
		body: 'wrong',
		at: 1,
	};
	saveNotes('/p', [note], 1, file);
	expect(loadNotes('/p', file)).toEqual([note]);
	// Another project's notes are not this one's.
	expect(loadNotes('/other', file)).toEqual([]);
	saveNotes('/p', [], 2, file);
	expect(loadNotes('/p', file)).toEqual([]);
});

test('the configured remote is the one read', () => {
	const dir = mkdtempSync(join(tmpdir(), 'dune-remote-'));
	const git = (...args: string[]) => execFileSync('git', args, { cwd: dir });
	git('init', '-q', '-b', 'main');
	writeFileSync(join(dir, 'a.ts'), 'const a = 1\n');
	git('remote', 'add', 'origin', 'git@github.com:letstri/druk.git');
	git('remote', 'add', 'upstream', 'https://gitlab.com/team/app.git');

	expect(remoteUrl(dir)).toBe('git@github.com:letstri/druk.git');
	expect(remoteUrl(dir, 'upstream')).toBe('https://gitlab.com/team/app.git');
	expect(remoteUrl(dir, 'nothing')).toBe(null);
});

// ── The editor ──────────────────────────────────────────────────────────────

const PROJECT = { 'a.ts': 'const a = 1\nconst b = 2\n' };

/** Write a note on the open file's current line, through the palette. */
async function noteLine(t: Harness, kind: string, text: string) {
	await runCommand(t, kind === 'note' ? 'Add note' : `Add ${kind} note`);
	await press(t, (i) => void i.typeText(text));
	await press(t, (i) => i.pressEnter());
}

test('a note lands in the review panel', async () => {
	const t = await launch(fixture(PROJECT), {}, { width: 100, height: 24 });
	await openFile(t, 'a.ts');
	await noteLine(t, 'issue', 'this should be const');

	await runCommand(t, 'Open review panel');
	await settle(t);
	expect(t.captureCharFrame()).toContain('a.ts');
	expect(t.captureCharFrame()).toContain('ISSUE 1');
});

test('opening the panel fetches by itself, and is quiet where the key is loud', async () => {
	const t = await launch(fixture(PROJECT), {}, { width: 100, height: 24 });
	await runCommand(t, 'Open review panel');
	// Nothing to ask — no repository at all — and the panel says so to nobody:
	// the user changed sidebar view, they did not ask for a fetch.
	await settle(t, 200);
	expect(t.captureCharFrame()).not.toContain('Not a git repository');

	// The command the user reaches for still reports what stopped it.
	await runCommand(t, 'Fetch pull request comments');
	await settle(t);
	expect(t.captureCharFrame()).toContain('Not a git repository');
});

test('a note needs a file, and says so from the tree', async () => {
	const t = await launch(fixture(PROJECT), {}, { width: 100, height: 24 });
	await runCommand(t, 'Add issue note');
	expect(t.captureCharFrame()).toContain('No file to review');
});

test('r answers the note under the cursor, and the row counts the thread', async () => {
	const t = await launch(fixture(PROJECT), {}, { width: 100, height: 24 });
	await openFile(t, 'a.ts');
	await noteLine(t, 'issue', 'this should be const');

	await runCommand(t, 'Open review panel');
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressKey('r'));
	expect(t.captureCharFrame()).toContain('Reply');
	await press(t, (i) => void i.typeText('agreed, fixing it'));
	await press(t, (i) => i.pressEnter());

	const frame = t.captureCharFrame();
	expect(frame).toContain('ISSUE 1 ↳1');
	// The reply itself is not a separate row — it only ever shows through the count.
	expect(frame).not.toContain('agreed, fixing it');
});

test('a reply to a reply still joins the same thread', async () => {
	const t = await launch(fixture(PROJECT), {}, { width: 100, height: 24 });
	await openFile(t, 'a.ts');
	await noteLine(t, 'question', 'why two?');

	await runCommand(t, 'Open review panel');
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressKey('r'));
	await press(t, (i) => void i.typeText('first answer'));
	await press(t, (i) => i.pressEnter());

	// Still on the same row: replying again answers the thread, not the reply.
	await press(t, (i) => i.pressKey('r'));
	await press(t, (i) => void i.typeText('second answer'));
	await press(t, (i) => i.pressEnter());

	expect(t.captureCharFrame()).toContain('QUESTION 1 ↳2');
});

test('Backspace in the panel drops the note under the cursor', async () => {
	const t = await launch(fixture(PROJECT), {}, { width: 100, height: 24 });
	await openFile(t, 'a.ts');
	await noteLine(t, 'question', 'why two?');

	await runCommand(t, 'Open review panel');
	// Onto the note under its file heading, then remove it.
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressBackspace());
	await settle(t);
	expect(t.captureCharFrame()).toContain('Removed the question');
	expect(t.captureCharFrame()).toContain('No notes yet');
});

test('removing a note removes the replies answering it', async () => {
	const t = await launch(fixture(PROJECT), {}, { width: 100, height: 24 });
	await openFile(t, 'a.ts');
	await noteLine(t, 'question', 'why two?');

	await runCommand(t, 'Open review panel');
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressKey('r'));
	await press(t, (i) => void i.typeText('an answer'));
	await press(t, (i) => i.pressEnter());
	expect(t.captureCharFrame()).toContain('QUESTION 1 ↳1');

	await press(t, (i) => i.pressBackspace());
	await settle(t);
	expect(t.captureCharFrame()).toContain('No notes yet');
});

test('the fetch says what stopped it outside a repository', async () => {
	const t = await launch(fixture(PROJECT), {}, { width: 100, height: 24 });
	await runCommand(t, 'Fetch pull request comments');
	await settle(t);
	expect(t.captureCharFrame()).toContain('Not a git repository');
});
