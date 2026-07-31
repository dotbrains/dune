import { relative } from 'node:path';
import type { KeyEvent } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import { createMemo, createSignal, For, Show } from 'solid-js';

import type { FileStatus } from '../core/git';
import { ui } from '../themes';
import { modalWidth, PAD } from './modal';
import { Overlay } from './Overlay';

export interface CommitFile {
	path: string;
	status: FileStatus;
	staged: boolean;
}

export interface CommitModalProps {
	rootDir: string;
	files: CommitFile[];
	onCommit: (paths: string[]) => void;
	onCancel: () => void;
}

const statusLabel: Record<FileStatus, string> = {
	added: 'A',
	deleted: 'D',
	modified: 'M',
	renamed: 'R',
	untracked: 'U',
};

export function CommitModal(props: CommitModalProps) {
	const dimensions = useTerminalDimensions();
	const [index, setIndex] = createSignal(0);
	const initial = () => {
		const staged = props.files.filter((file) => file.staged).map((file) => file.path);
		return new Set(staged.length > 0 ? staged : props.files.map((file) => file.path));
	};
	const [selected, setSelected] = createSignal(initial());

	const width = () => modalWidth(dimensions().width, 0.58, 68, 92);
	const rows = createMemo(() => props.files);
	const selectedCount = () => selected().size;
	const lineWidth = () => width() - PAD * 2 - 5;

	const toggle = (path: string) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (!next.delete(path)) next.add(path);
			return next;
		});

	const toggleAll = () => {
		setSelected((prev) =>
			prev.size === props.files.length
				? new Set<string>()
				: new Set(props.files.map((file) => file.path)),
		);
	};

	useKeyboard((key: KeyEvent) => {
		const k = key.name;
		if (k === 'up') {
			key.preventDefault();
			setIndex((i) => Math.max(0, i - 1));
		} else if (k === 'down') {
			key.preventDefault();
			setIndex((i) => Math.min(rows().length - 1, i + 1));
		} else if (k === 'space') {
			key.preventDefault();
			const file = rows()[index()];
			if (file) toggle(file.path);
		} else if (k.toLowerCase() === 'a') {
			key.preventDefault();
			toggleAll();
		} else if (k === 'return' || k === 'enter') {
			key.preventDefault();
			if (selectedCount() > 0) props.onCommit([...selected()]);
		} else if (k === 'escape') {
			key.preventDefault();
			props.onCancel();
		}
	});

	return (
		<Overlay zIndex={155}>
			<box
				width={width()}
				flexDirection="column"
				backgroundColor={ui.panelBg}
				border
				borderStyle="rounded"
				borderColor={ui.accent}
				title=" Commit changes "
				titleColor={ui.accent}
				paddingLeft={PAD}
				paddingRight={PAD}
			>
				<text
					fg={ui.dim}
					bg={ui.panelBg}
					content={`${selectedCount()} of ${props.files.length} files selected`}
				/>
				<text fg={ui.panelBg} bg={ui.panelBg} content="" />
				<For each={rows()}>
					{(file, i) => {
						const active = () => i() === index();
						const bg = () => (active() ? ui.treeSelectedBg : ui.panelBg);
						const rel = () => relative(props.rootDir, file.path) || file.path;
						const checked = () => (selected().has(file.path) ? 'x' : ' ');
						const text = () =>
							`[${checked()}] ${statusLabel[file.status]} ${rel()}`.slice(0, lineWidth());
						return (
							<box flexDirection="row" backgroundColor={bg()}>
								<text fg={ui.accent} bg={bg()} flexShrink={0} content={active() ? '▌ ' : '  '} />
								<text fg={active() ? ui.text : ui.dim} bg={bg()} content={text()} />
							</box>
						);
					}}
				</For>
				<Show when={props.files.length === 0}>
					<text fg={ui.dim} bg={ui.panelBg} content="No changed files" />
				</Show>
				<text fg={ui.panelBg} bg={ui.panelBg} content="" />
				<text
					fg={ui.dim}
					bg={ui.panelBg}
					content="Space toggle · A all · Enter commit · Esc cancel"
				/>
			</box>
		</Overlay>
	);
}
