import { relative } from 'node:path';

import type { KeyEvent } from '@opentui/core';
import { useKeyboard } from '@opentui/solid';
import { createSignal, For, Show } from 'solid-js';

import type { FileStatus } from '../../core/git';
import { ui } from '../../themes';
import { MARKS, statusColor } from '../FileTree';

export function GitPanel(props: {
	rootDir: string;
	branch: string | null;
	width: number;
	focused: boolean;
	status: Map<string, FileStatus>;
	onFocus: () => void;
	onDiff: (path: string) => void;
	onCommit: () => void;
	onPush: () => void;
}) {
	const [index, setIndex] = createSignal(0);
	const changes = () =>
		[...props.status]
			.map(([path, status]) => ({ path, status, rel: relative(props.rootDir, path) }))
			.toSorted((a, b) => a.rel.localeCompare(b.rel));
	const selected = () => Math.min(index(), Math.max(0, changes().length - 1));

	useKeyboard((key: KeyEvent) => {
		if (!props.focused) return;
		const rows = Math.max(1, changes().length);
		if (key.name === 'up') setIndex((at) => (at - 1 + rows) % rows);
		else if (key.name === 'down') setIndex((at) => (at + 1) % rows);
		else if (key.name === 'return' || key.name === 'enter') {
			const change = changes()[selected()];
			if (change) props.onDiff(change.path);
		} else if (key.name === 'c') props.onCommit();
		else if (key.name === 'p') props.onPush();
		else return;
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
				<text
					fg={props.focused ? ui.text : ui.dim}
					bg={ui.panelBg}
					content={props.branch ?? 'git'}
				/>
				<text fg={ui.faint} bg={ui.panelBg} content="source control" />
			</box>
			<Show
				when={changes().length > 0}
				fallback={
					<box flexGrow={1} backgroundColor={ui.panelBg} paddingLeft={2}>
						<text fg={ui.faint} bg={ui.panelBg} content="no changes" />
					</box>
				}
			>
				<box flexGrow={1} flexDirection="column" backgroundColor={ui.panelBg}>
					<For each={changes()}>
						{(change, at) => {
							const active = () => at() === selected();
							const bg = () => (active() ? ui.treeSelectedBg : ui.panelBg);
							return (
								<box
									height={1}
									flexDirection="row"
									backgroundColor={bg()}
									onMouseDown={() => props.onDiff(change.path)}
								>
									<box flexGrow={1} backgroundColor={bg()}>
										<text fg={active() ? ui.text : ui.dim} bg={bg()} content={` ${change.rel}`} />
									</box>
									<text
										fg={statusColor(change.status)}
										bg={bg()}
										flexShrink={0}
										content={`${MARKS[change.status]} `}
									/>
								</box>
							);
						}}
					</For>
				</box>
			</Show>
			<box height={1} backgroundColor={ui.panelBg} paddingLeft={1}>
				<text fg={ui.faint} bg={ui.panelBg} content="enter diff · c commit · p push" />
			</box>
		</box>
	);
}
