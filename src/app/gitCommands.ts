import { relative } from 'node:path';
import { createSignal } from 'solid-js';

import {
	branchDiffFiles,
	commitPaths,
	defaultBranch,
	diffFiles,
	fetch as gitFetch,
	inRepository,
	lastCommitSubject,
	push as gitPush,
	stagedPaths,
	stashPop,
	stashPush,
	statusMap,
	undoLastCommit,
} from '../core/git';
import type { GitResult, Upstream } from '../core/git';
import type { DiffFile } from '../core/git';
import type { CommitFile } from '../ui/CommitModal';
import type { Tone } from '../ui/StatusBar';
import type { Prompt } from './types';

export function createGitCommands(deps: {
	rootDir: string;
	branch: () => string | null;
	upstream: () => Upstream | null;
	setBusy: (busy: { label: string; done: number; total: number } | null) => void;
	setGitRevision: (update: (n: number) => number) => void;
	setPrompt: (prompt: Prompt) => void;
	say: (msg: string, tone?: Tone) => void;
	whileFree: (run: () => void) => void;
	syncFromDisk: () => void;
}) {
	const [commitFiles, setCommitFiles] = createSignal<CommitFile[] | null>(null);
	const [commitSelection, setCommitSelection] = createSignal<string[]>([]);
	const [diff, setDiff] = createSignal<DiffFile[] | null>(null);
	const [panel, setPanel] = createSignal(false);

	const runGit = (label: string, action: () => Promise<GitResult>, success: string) => {
		if (!inRepository(deps.rootDir)) return deps.say('Not a git repository', 'warn');
		deps.whileFree(
			() =>
				void (async () => {
					deps.setBusy({ label, done: 0, total: 0 });
					const result = await action();
					deps.setBusy(null);
					deps.setGitRevision((n) => n + 1);
					deps.syncFromDisk();
					if (!result.ok) return deps.say(result.detail || `${label} failed`, 'error');
					deps.say(result.detail || success);
				})(),
		);
	};

	const openCommitPicker = () => {
		if (!inRepository(deps.rootDir)) return deps.say('Not a git repository', 'warn');
		const statuses = statusMap(deps.rootDir);
		if (statuses.size === 0) return deps.say('Nothing to commit', 'warn');
		const staged = stagedPaths(deps.rootDir);
		setCommitFiles(
			[...statuses]
				.map(([path, status]) => ({ path, status, staged: staged.has(path) }))
				.toSorted((a, b) =>
					relative(deps.rootDir, a.path).localeCompare(relative(deps.rootDir, b.path)),
				),
		);
	};

	const openDiff = (path?: string | null) => {
		if (!inRepository(deps.rootDir)) return deps.say('Not a git repository', 'warn');
		const files = diffFiles(deps.rootDir, path ?? undefined);
		if (files.length === 0)
			return deps.say(path ? 'No changes in current file' : 'No changes', 'warn');
		setDiff(files);
	};

	const openBranchComparison = () => {
		if (!inRepository(deps.rootDir)) return deps.say('Not a git repository', 'warn');
		const base = defaultBranch(deps.rootDir);
		if (!base) return deps.say('No branch to compare against', 'warn');
		const files = branchDiffFiles(deps.rootDir, base);
		if (files.length === 0) return deps.say(`No differences from ${base}`, 'warn');
		setDiff(files);
		deps.say(`Comparing against ${base}`);
	};

	const startCommit = (paths: string[]) => {
		setCommitFiles(null);
		setCommitSelection(paths);
		deps.setPrompt({ kind: 'commitMessage' });
	};

	const submitCommit = (message: string) => {
		const paths = commitSelection();
		setCommitSelection([]);
		if (paths.length === 0) return deps.say('Nothing selected', 'warn');
		runGit('Committing', () => commitPaths(deps.rootDir, message, paths), 'Committed');
	};

	const confirmUndoCommit = () => {
		if (!inRepository(deps.rootDir)) return deps.say('Not a git repository', 'warn');
		const subject = lastCommitSubject(deps.rootDir);
		if (!subject) return deps.say('No commit to undo', 'warn');
		deps.setPrompt({ kind: 'undoCommit', subject });
	};

	return {
		commitFiles,
		diff,
		panel,
		togglePanel: () => setPanel((open) => !open),
		closeDiff: () => setDiff(null),
		cancelCommit: () => setCommitFiles(null),
		startCommit,
		submitCommit,
		confirmUndoCommit,
		undoCommit: () =>
			runGit('Undoing commit', () => undoLastCommit(deps.rootDir), 'Undid last commit'),
		stash: () => runGit('Stashing', () => stashPush(deps.rootDir), 'Stashed changes'),
		stashPop: () => runGit('Applying stash', () => stashPop(deps.rootDir), 'Applied stash'),
		fetch: () => runGit('Fetching', () => gitFetch(deps.rootDir), 'Fetched'),
		openDiff,
		openBranchComparison,
		push: () =>
			runGit(
				'Pushing',
				() => {
					const name = deps.branch();
					if (!name) return Promise.resolve({ ok: false, detail: 'No branch to push' });
					return gitPush(deps.rootDir, name, !!deps.upstream()?.name);
				},
				'Pushed',
			),
		openCommitPicker,
	};
}
