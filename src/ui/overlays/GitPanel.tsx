import { relative } from 'node:path';

import type { KeyEvent } from '@opentui/core';
import { useKeyboard } from '@opentui/solid';
import { createMemo, createSignal, For, Show } from 'solid-js';

import type { ChangeRow } from '../../core/changeTree';
import { changeRows } from '../../core/changeTree';
import type { FileStatus } from '../../core/git';
import { fuzzyScore } from '../../core/search';
import { ui } from '../../themes';
import { MARKS, statusColor } from '../FileTree';

export function GitPanel(props: {
	rootDir: string;
	branch: string | null;
	base: string | null;
	upstream: { ahead: number; behind: number } | null;
	width: number;
	focused: boolean;
	status: Map<string, FileStatus>;
	onFocus: () => void;
	onDiff: (path: string) => void;
	onCommit: () => void;
	onPush: () => void;
	onBranchAction: (action: 'switch' | 'compare' | 'commits') => void;
}) {
	const [index, setIndex] = createSignal(0);
	const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set());
	const [filtering, setFiltering] = createSignal(false);
	const [filter, setFilter] = createSignal('');
	const changes = createMemo(() =>
		[...props.status]
			.map(([path, status]) => ({ path, status, rel: relative(props.rootDir, path) }))
			.filter((change) => {
				const query = filter().trim();
				return query.length === 0 || fuzzyScore(change.rel, query) !== null;
			})
			.toSorted((a, b) => a.rel.localeCompare(b.rel)),
	);
	const rows = createMemo(() => changeRows(changes(), collapsed()));
	const selected = () => Math.min(index(), Math.max(0, rows().length - 1));
	const headline = () => {
		const parts = [props.branch ?? 'git'];
		const upstream = props.upstream;
		if (upstream?.ahead) parts.push(`↑${upstream.ahead}`);
		if (upstream?.behind) parts.push(`↓${upstream.behind}`);
		return parts.join(' ');
	};
	const toggleDir = (rel: string) =>
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(rel)) next.delete(rel);
			else next.add(rel);
			return next;
		});
	const setFilterValue = (value: string) => {
		setFilter(value);
		setIndex(0);
	};
	const activate = (row: ChangeRow | undefined) => {
		if (!row) return;
		if (row.kind === 'dir') toggleDir(row.rel);
		else props.onDiff(row.change.path);
	};

	useKeyboard((key: KeyEvent) => {
		if (!props.focused) return;
		const count = Math.max(1, rows().length);
		const plain = !key.ctrl && !key.meta && !key.option && key.sequence?.length === 1;
		const row = () => rows()[selected()];
		const printable =
			key.sequence?.length === 1 &&
			key.sequence >= ' ' &&
			key.sequence !== '\u007F' &&
			!key.ctrl &&
			!key.meta &&
			!key.option;
		if (filtering()) {
			if (key.name === 'escape') {
				if (filter()) setFilterValue('');
				else setFiltering(false);
			} else if (key.name === 'backspace') setFilterValue(filter().slice(0, -1));
			else if (printable) setFilterValue(`${filter()}${key.sequence}`);
			else return;
		} else if (key.name === 'up') setIndex((at) => (at - 1 + count) % count);
		else if (key.name === 'down') setIndex((at) => (at + 1) % count);
		else if (key.name === 'return' || key.name === 'enter') {
			activate(row());
		} else if (key.name === 'left') {
			const current = row();
			if (current?.kind === 'dir' && !current.collapsed) toggleDir(current.rel);
		} else if (key.name === 'right') {
			const current = row();
			if (current?.kind === 'dir' && current.collapsed) toggleDir(current.rel);
		} else if (plain && key.name === 'c') {
			if (props.base) props.onBranchAction('commits');
			else props.onCommit();
		} else if (plain && key.name === 'p') props.onPush();
		else if (plain && key.name === 'b' && !key.shift) props.onBranchAction('switch');
		else if (plain && ((key.name === 'b' && key.shift) || key.name === 'B'))
			props.onBranchAction('compare');
		else if (plain && key.sequence === '/' && props.base) {
			setFiltering(true);
			setFilterValue('');
		} else return;
		key.preventDefault();
	});

	return (
		<box
			width={props.width}
			flexDirection="column"
			backgroundColor={ui.panelBg}
			flexShrink={0}
			onMouseDown={props.onFocus}
		>
			<box height={2} flexDirection="column" backgroundColor={ui.panelBg} paddingLeft={2}>
				<text fg={props.focused ? ui.text : ui.dim} bg={ui.panelBg} content={headline()} />
				<text
					fg={props.base ? ui.dirty : ui.faint}
					bg={ui.panelBg}
					content={
						filtering() || filter()
							? `filter ${filter()}`
							: props.base
								? `vs ${props.base}`
								: 'source control'
					}
				/>
			</box>
			<Show
				when={rows().length > 0}
				fallback={
					<box flexGrow={1} backgroundColor={ui.panelBg} paddingLeft={2}>
						<text fg={ui.faint} bg={ui.panelBg} content={filter() ? 'no matches' : 'no changes'} />
					</box>
				}
			>
				<box flexGrow={1} flexDirection="column" backgroundColor={ui.panelBg}>
					<For each={rows()}>
						{(row, at) => {
							const active = () => at() === selected();
							const bg = () => (active() ? ui.treeSelectedBg : ui.panelBg);
							return (
								<box
									height={1}
									flexDirection="row"
									backgroundColor={bg()}
									onMouseDown={() => activate(row)}
								>
									<text
										fg={ui.faint}
										bg={bg()}
										flexShrink={0}
										content={` ${'  '.repeat(row.depth)}`}
									/>
									<Show when={row.kind === 'dir'}>
										{() =>
											row.kind === 'dir' && (
												<text
													fg={ui.dim}
													bg={bg()}
													flexShrink={0}
													content={row.collapsed ? '▸ ' : '▾ '}
												/>
											)
										}
									</Show>
									<box flexGrow={1} backgroundColor={bg()}>
										<text
											fg={row.kind === 'dir' ? ui.folder : active() ? ui.text : ui.dim}
											bg={bg()}
											content={row.kind === 'dir' ? row.label : ` ${row.label}`}
										/>
									</box>
									<Show when={row.kind === 'dir'}>
										{() =>
											row.kind === 'dir' && (
												<text
													fg={ui.faint}
													bg={bg()}
													flexShrink={0}
													content={row.collapsed ? `${row.files} ` : ' '}
												/>
											)
										}
									</Show>
									<Show when={row.kind === 'file'}>
										{() =>
											row.kind === 'file' && (
												<text
													fg={statusColor(row.change.status)}
													bg={bg()}
													flexShrink={0}
													content={`${MARKS[row.change.status]} `}
												/>
											)
										}
									</Show>
								</box>
							);
						}}
					</For>
				</box>
			</Show>
			<box height={1} backgroundColor={ui.panelBg} paddingLeft={1}>
				<text
					fg={ui.faint}
					bg={ui.panelBg}
					content={`b branch · B compare · c ${props.base ? 'commits' : 'commit'} · ${props.base ? '/ filter · ' : ''}p push · enter diff · ←→ fold`}
				/>
			</box>
		</box>
	);
}
