import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';

import { defaultBranch } from './git';
import type { FileStatus } from './git';

export interface DiffFile {
	path: string;
	rel: string;
	status: FileStatus;
	oldRel?: string;
	binary?: boolean;
	oldText: string;
	newText: string;
}

export type BranchCommit = { oid: string; shortOid: string; subject: string; authorName: string };

const MAX_OUTPUT = 128 * 1024 * 1024;

function git(cwd: string, args: string[], timeout = 5000) {
	return spawnSync('git', args, { cwd, encoding: 'utf8', timeout, maxBuffer: MAX_OUTPUT });
}

function keyBase(cwd: string): string | null {
	const top = git(cwd, ['rev-parse', '--show-toplevel'], 3000);
	if (top.status !== 0) return null;
	const root = top.stdout.trim();
	try {
		if (realpathSync(cwd) === realpathSync(root)) return cwd;
	} catch {
		// unreadable path: fall back to git's own root
	}
	return root;
}

function textAtRef(cwd: string, ref: string, rel: string): string | null {
	const run = git(cwd, ['show', `${ref}:${rel}`], 5000);
	return run.status === 0 ? run.stdout : null;
}

export const hasBinaryContent = (text: string) => text.includes('\0');

const STATUS_BY_CODE: Record<string, FileStatus> = {
	A: 'added',
	M: 'modified',
	R: 'renamed',
	C: 'modified',
	D: 'deleted',
};

export function branchDiffFiles(cwd: string, baseBranch = defaultBranch(cwd)): DiffFile[] {
	const base = keyBase(cwd);
	if (base === null || !baseBranch) return [];
	const mergeBase = git(cwd, ['merge-base', baseBranch, 'HEAD'], 5000);
	if (mergeBase.status !== 0) return [];
	return refDiffFiles(cwd, base, mergeBase.stdout.trim(), 'HEAD');
}

function refDiffFiles(cwd: string, base: string, from: string, to: string): DiffFile[] {
	const names = git(cwd, ['diff', '--name-status', '-M', '-z', from, to], 5000);
	if (names.status !== 0 || !names.stdout) return [];
	const parts = names.stdout.split('\0');
	const files: DiffFile[] = [];
	for (let i = 0; i < parts.length;) {
		const code = parts[i++]?.[0] ?? '';
		const status = STATUS_BY_CODE[code];
		if (!status) continue;
		const oldRel = code === 'R' || code === 'C' ? parts[i++] : parts[i];
		const rel = parts[i++];
		if (!rel) continue;
		const oldText = status === 'added' ? '' : (textAtRef(cwd, from, oldRel ?? rel) ?? '');
		const newText = status === 'deleted' ? '' : textAtRef(cwd, to, rel);
		if (newText === null && status !== 'deleted') continue;
		const nextText = newText ?? '';
		files.push({
			path: join(base, rel),
			rel,
			status,
			oldRel,
			binary: hasBinaryContent(oldText) || hasBinaryContent(nextText),
			oldText,
			newText: nextText,
		});
	}
	return files.toSorted((a, b) => a.rel.localeCompare(b.rel));
}

export function branchDiffCommits(cwd: string, baseBranch = defaultBranch(cwd)): BranchCommit[] {
	if (!baseBranch) return [];
	const format = '%H%x00%h%x00%s%x00%an';
	const run = git(cwd, ['log', '-z', `--format=${format}`, `${baseBranch}..HEAD`], 5000);
	if (run.status !== 0 || !run.stdout) return [];
	const fields = run.stdout.split('\0');
	if (fields.at(-1) === '') fields.pop();
	const commits: BranchCommit[] = [];
	for (let i = 0; i + 3 < fields.length; i += 4) {
		commits.push({
			oid: fields[i]!,
			shortOid: fields[i + 1]!,
			subject: fields[i + 2]!,
			authorName: fields[i + 3]!,
		});
	}
	return commits;
}

export function branchBehindCount(cwd: string, baseBranch = defaultBranch(cwd)): number {
	if (!baseBranch) return 0;
	const run = git(cwd, ['rev-list', '--count', `HEAD..${baseBranch}`], 5000);
	return run.status === 0 ? Number(run.stdout.trim()) || 0 : 0;
}

export function commitDiffFiles(cwd: string, oid: string): DiffFile[] {
	const base = keyBase(cwd);
	if (base === null) return [];
	const commit = git(cwd, ['rev-parse', '--verify', `${oid}^{commit}`], 5000);
	if (commit.status !== 0) return [];
	const parent = git(cwd, ['rev-parse', '--verify', `${commit.stdout.trim()}^`], 5000);
	const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
	return refDiffFiles(cwd, base, parent.status === 0 ? parent.stdout.trim() : emptyTree, oid);
}
