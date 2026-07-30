import { relative } from 'node:path';
import { createSignal } from 'solid-js';

import {
	branchDiffFiles,
	commitPaths,
	createBranch,
	defaultBranch,
	deleteBranch,
	diffFiles,
	fetch as gitFetch,
	inRepository,
	lastCommitSubject,
	listBranches,
	localBranchName,
	mergeBranch,
	push as gitPush,
	renameBranch,
	stagedPaths,
	stashPop,
	stashPush,
	switchBranch,
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
	const [branchMode, setBranchMode] = createSignal<
		'compare' | 'delete' | 'merge' | 'rename' | 'switch'
	>('compare');
	const [branchChoices, setBranchChoices] = createSignal<{ id: string; label: string }[] | null>(
		null,
	);

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

	const compareWith = (base: string) => {
		const files = branchDiffFiles(deps.rootDir, base);
		if (files.length === 0) return deps.say(`No differences from ${base}`, 'warn');
		setDiff(files);
		deps.say(`Comparing against ${base}`);
	};

	const openBranchComparison = () => {
		if (!inRepository(deps.rootDir)) return deps.say('Not a git repository', 'warn');
		const branches = listBranches(deps.rootDir).filter((branch) => branch.name !== deps.branch());
		if (branches.length === 0) {
			const base = defaultBranch(deps.rootDir);
			return base ? compareWith(base) : deps.say('No branch to compare against', 'warn');
		}
		setBranchMode('compare');
		setBranchChoices(branches.map((branch) => ({ id: branch.name, label: branch.name })));
	};

	const openBranchSwitch = () => {
		if (!inRepository(deps.rootDir)) return deps.say('Not a git repository', 'warn');
		const branches = listBranches(deps.rootDir).filter((branch) => !branch.current);
		if (branches.length === 0) return deps.say('No other branch to switch to', 'warn');
		setBranchMode('switch');
		setBranchChoices(
			branches.map((branch) => ({
				id: branch.name,
				label: branch.remote ? `${branch.name}  remote` : branch.name,
			})),
		);
	};

	const openBranchMerge = () => {
		if (!inRepository(deps.rootDir)) return deps.say('Not a git repository', 'warn');
		const branches = listBranches(deps.rootDir).filter((branch) => !branch.current);
		if (branches.length === 0) return deps.say('No other branch to merge', 'warn');
		setBranchMode('merge');
		setBranchChoices(branches.map((branch) => ({ id: branch.name, label: branch.name })));
	};

	const openBranchRename = () => {
		if (!inRepository(deps.rootDir)) return deps.say('Not a git repository', 'warn');
		const branches = listBranches(deps.rootDir).filter((branch) => !branch.remote);
		if (branches.length === 0) return deps.say('No local branch to rename', 'warn');
		setBranchMode('rename');
		setBranchChoices(branches.map((branch) => ({ id: branch.name, label: branch.name })));
	};

	const openBranchDelete = () => {
		if (!inRepository(deps.rootDir)) return deps.say('Not a git repository', 'warn');
		const branches = listBranches(deps.rootDir).filter(
			(branch) => !branch.remote && !branch.current,
		);
		if (branches.length === 0) return deps.say('No other local branch to delete', 'warn');
		setBranchMode('delete');
		setBranchChoices(branches.map((branch) => ({ id: branch.name, label: branch.name })));
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

	const submitBranch = (name: string) => {
		runGit('Creating branch', () => createBranch(deps.rootDir, name), `On ${name}`);
	};

	const rename = (from: string, to: string) => {
		runGit(
			'Renaming branch',
			() => renameBranch(deps.rootDir, from, to),
			`Renamed ${from} to ${to}`,
		);
	};

	const remove = (name: string) => {
		runGit('Deleting branch', () => deleteBranch(deps.rootDir, name), `Deleted ${name}`);
	};

	const confirmUndoCommit = () => {
		if (!inRepository(deps.rootDir)) return deps.say('Not a git repository', 'warn');
		const subject = lastCommitSubject(deps.rootDir);
		if (!subject) return deps.say('No commit to undo', 'warn');
		deps.setPrompt({ kind: 'undoCommit', subject });
	};

	const openBranchPrompt = () => {
		if (!inRepository(deps.rootDir)) return deps.say('Not a git repository', 'warn');
		deps.setPrompt({ kind: 'newBranch' });
	};

	const merge = (name: string) => {
		runGit('Merging', () => mergeBranch(deps.rootDir, name), `Merged ${name}`);
	};

	return {
		commitFiles,
		branchChoices,
		diff,
		panel,
		togglePanel: () => setPanel((open) => !open),
		closeDiff: () => setDiff(null),
		cancelCommit: () => setCommitFiles(null),
		closeBranchChoices: () => setBranchChoices(null),
		branchChoiceTitle: () =>
			branchMode() === 'switch'
				? 'Switch to branch'
				: branchMode() === 'merge'
					? 'Merge into current branch'
					: branchMode() === 'rename'
						? 'Rename branch'
						: branchMode() === 'delete'
							? 'Delete branch'
							: 'Compare against branch',
		branchChoiceMessage: () =>
			branchMode() === 'switch'
				? 'Enter checks out the selected branch.'
				: branchMode() === 'merge'
					? 'Enter chooses a branch to merge into the current branch.'
					: branchMode() === 'rename'
						? 'Enter chooses a branch to rename.'
						: branchMode() === 'delete'
							? 'Enter chooses a branch to delete.'
							: 'Enter compares the current branch against the selected branch.',
		pickBranch: (name: string) => {
			setBranchChoices(null);
			if (branchMode() === 'compare') return compareWith(name);
			if (branchMode() === 'merge') return deps.setPrompt({ kind: 'mergeBranch', name });
			if (branchMode() === 'rename') return deps.setPrompt({ kind: 'renameBranch', from: name });
			if (branchMode() === 'delete') return deps.setPrompt({ kind: 'deleteBranch', name });
			const branch = listBranches(deps.rootDir).find((item) => item.name === name);
			runGit(
				'Switching branch',
				() => switchBranch(deps.rootDir, name, branch?.remote ?? false),
				`On ${localBranchName(name)}`,
			);
		},
		startCommit,
		submitCommit,
		submitBranch,
		rename,
		remove,
		merge,
		confirmUndoCommit,
		undoCommit: () =>
			runGit('Undoing commit', () => undoLastCommit(deps.rootDir), 'Undid last commit'),
		stash: () => runGit('Stashing', () => stashPush(deps.rootDir), 'Stashed changes'),
		stashPop: () => runGit('Applying stash', () => stashPop(deps.rootDir), 'Applied stash'),
		fetch: () => runGit('Fetching', () => gitFetch(deps.rootDir), 'Fetched'),
		openDiff,
		openBranchComparison,
		openBranchSwitch,
		openBranchMerge,
		openBranchRename,
		openBranchDelete,
		openBranchPrompt,
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
