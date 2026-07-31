import type { FileStatus } from './git';

export interface Change {
	path: string;
	rel: string;
	status: FileStatus;
}

export interface FileRow {
	kind: 'file';
	depth: number;
	label: string;
	change: Change;
}

export interface DirRow {
	kind: 'dir';
	depth: number;
	label: string;
	rel: string;
	collapsed: boolean;
	files: number;
}

export type ChangeRow = FileRow | DirRow;

export function ancestorDirs(rel: string): string[] {
	const parts = rel.split('/');
	return parts.slice(0, -1).map((_, at) => parts.slice(0, at + 1).join('/'));
}

export function changeRows(
	changes: readonly Change[],
	mode: 'tree' | 'list' = 'tree',
	collapsed: ReadonlySet<string> = new Set(),
): ChangeRow[] {
	if (mode === 'list') {
		return changes.map((change) => ({ kind: 'file', depth: 0, label: change.rel, change }));
	}

	const rows: ChangeRow[] = [];
	const emitted = new Map<string, { depth: number }>();

	for (const change of changes) {
		const dirs = ancestorDirs(change.rel);
		let hidden = false;
		let depth = 0;
		for (const dir of dirs) {
			if (hidden) break;
			const seen = emitted.get(dir);
			if (seen) {
				depth = seen.depth + 1;
			} else {
				const folded = foldable(changes, dir);
				rows.push({
					kind: 'dir',
					depth,
					label: folded.slice(dir.lastIndexOf('/') + 1),
					rel: dir,
					collapsed: collapsed.has(dir),
					files: changes.filter((candidate) => candidate.rel.startsWith(`${dir}/`)).length,
				});
				emitted.set(dir, { depth });
				for (const joined of ancestorsUnder(dir, folded)) emitted.set(joined, { depth });
				depth += 1;
			}
			if (collapsed.has(dir)) hidden = true;
		}
		if (hidden) continue;
		rows.push({
			kind: 'file',
			depth,
			label: change.rel.slice(change.rel.lastIndexOf('/') + 1),
			change,
		});
	}
	return rows;
}

function foldable(changes: readonly Change[], dir: string): string {
	let at = dir;
	for (;;) {
		const under = changes.filter((change) => change.rel.startsWith(`${at}/`));
		const next = new Set(under.map((change) => change.rel.slice(at.length + 1).split('/')[0]!));
		if (next.size !== 1) return at;
		const only = [...next][0]!;
		if (under.some((change) => change.rel === `${at}/${only}`)) return at;
		at = `${at}/${only}`;
	}
}

function ancestorsUnder(dir: string, folded: string): string[] {
	if (folded === dir) return [];
	return ancestorDirs(`${folded}/x`).filter((rel) => rel.length > dir.length);
}
