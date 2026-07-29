import { basename } from 'node:path';

import { on, onCleanup, onMount, createEffect } from 'solid-js';

import type { Config } from '../core/config';
import type { TreeNode } from '../core/fs';
import type { FileStatus, LineChange, Upstream } from '../core/git';
import { currentBranch, diffLines, ignoredAmong, statusMap, upstreamOf } from '../core/git';
import { saveSession } from '../core/session';
import { checkForUpdate } from '../core/update';
import { watchTree } from '../core/fs';
import { clashWarning } from './clashes';
import { CLASH_CHANGED, CLASH_DELETED, READY } from './constants';
import type { BufferState, DiskSync } from './types';

export function useAppLifecycle(deps: {
	rootDir: string;
	single: string | null;
	openLine: number | null | undefined;
	initialConfig: Config;
	checkUpdates: boolean | undefined;
	restoredFailed: string | null | undefined;
	activeBuffer: () => BufferState | undefined;
	activePath: () => string | null;
	expanded: () => Set<string>;
	nodes: () => TreeNode[];
	gitRevision: () => number;
	reloadKey: () => number;
	sidebar: () => boolean;
	tabs: () => string[];
	branch: () => string | null;
	config: Config;
	renderer: {
		stdin: {
			on: (event: 'data', fn: (chunk: BufferState | string) => void) => void;
			off: (event: 'data', fn: (chunk: BufferState | string) => void) => void;
		};
	};
	saveDirtyOnBlur: () => void;
	syncFromDisk: () => DiskSync;
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
	setGitRevision: (update: (n: number) => number) => void;
	setGitLines: (lines: Map<number, LineChange>) => void;
	setGitStatus: (status: Map<string, FileStatus>) => void;
	setGitIgnored: (ignored: Set<string>) => void;
	setBranch: (branch: string | null) => void;
	setUpstream: (upstream: Upstream | null) => void;
	setGoto: (goto: { line: number; col: number; key: number }) => void;
	setNotice: (notice: { name: string; reason: string } | null) => void;
	setUpdate: (update: Awaited<ReturnType<typeof checkForUpdate>>) => void;
	status: () => { msg: string };
}) {
	onMount(() => {
		if (deps.restoredFailed && deps.single)
			deps.setNotice({ name: basename(deps.single), reason: deps.restoredFailed });
		const buffer = deps.activeBuffer();
		if (deps.openLine != null && buffer) {
			const total = buffer.content.split('\n').length;
			deps.setGoto({ line: Math.min(deps.openLine, total - 1), col: 0, key: 1 });
		}
	});
	onMount(() => {
		if (deps.checkUpdates === false) return;
		let cancelled = false;
		onCleanup(() => {
			cancelled = true;
		});
		void (async () => {
			const info = await checkForUpdate();
			if (!cancelled && info && info.latest !== deps.initialConfig.skipUpdate) deps.setUpdate(info);
		})();
	});
	onMount(() => {
		if (process.stdout.isTTY) process.stdout.write('\x1B[?1004h');
		const onStdin = (chunk: BufferState | string) => {
			if (deps.config.autoSaveOnBlur && chunk.toString().includes('\x1B[O')) deps.saveDirtyOnBlur();
		};
		deps.renderer.stdin.on('data', onStdin);
		onCleanup(() => {
			deps.renderer.stdin.off('data', onStdin);
			if (process.stdout.isTTY) process.stdout.write('\x1B[?1004l');
		});
	});
	onMount(() =>
		onCleanup(
			watchTree(deps.rootDir, (changed) => {
				if (changed.git) deps.setGitRevision((n) => n + 1);
				if (!changed.tree) return;
				const warning = clashWarning(deps.syncFromDisk());
				if (warning) deps.say(warning, 'warn');
				else if (
					deps.status().msg.startsWith(CLASH_CHANGED) ||
					deps.status().msg.startsWith(CLASH_DELETED)
				)
					deps.say(READY);
			}),
		),
	);
	createEffect(
		on(
			() => [deps.activePath(), deps.reloadKey(), deps.gitRevision()] as const,
			([path]) => deps.setGitLines(path ? diffLines(path) : new Map()),
		),
	);
	createEffect(
		on(
			() => [deps.branch(), deps.gitRevision()] as const,
			() => deps.setUpstream(upstreamOf(deps.rootDir)),
		),
	);
	createEffect(
		on(
			() => [deps.nodes(), deps.gitRevision(), deps.reloadKey()] as const,
			() => {
				deps.setGitStatus(statusMap(deps.rootDir));
				deps.setGitIgnored(
					ignoredAmong(
						deps.rootDir,
						deps.nodes().map((node) => node.path),
					),
				);
				deps.setBranch(currentBranch(deps.rootDir));
			},
		),
	);
	createEffect(
		on(
			() => [deps.tabs(), deps.activePath(), deps.expanded(), deps.sidebar()] as const,
			([openTabs, active, folders, showTree]) => {
				if (deps.single) return;
				saveSession(deps.rootDir, {
					tabs: openTabs,
					activePath: active,
					expanded: [...folders],
					sidebar: showTree,
				});
			},
		),
	);
}
