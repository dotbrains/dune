import type { KeyEvent } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import { createMemo, createSignal, For, Show } from 'solid-js';

import { splitText, unifiedDiff } from '../../core/diff';
import type { DiffFile } from '../../core/git';
import { ui } from '../../themes';
import { listRows, modalWidth, PAD } from '../modal';
import { Overlay } from '../Overlay';

interface DiffLine {
	text: string;
	kind: 'meta' | 'same' | 'add' | 'del';
}

type DiffMode = 'inline' | 'split';

function lines(text: string): string[] {
	return splitText(text);
}

function unified(file: DiffFile): DiffLine[] {
	return lines(unifiedDiff(file.rel, file.oldText, file.newText).patch).map((text) => ({
		text: `${text[0] === '+' || text[0] === '-' ? `${text[0]} ` : text[0] === ' ' ? '  ' : ''}${text.slice(text[0] === '@' ? 0 : 1)}`,
		kind:
			text.startsWith('---') || text.startsWith('+++') || text[0] === '@'
				? 'meta'
				: text[0] === '+'
					? 'add'
					: text[0] === '-'
						? 'del'
						: 'same',
	}));
}

function split(file: DiffFile, width: number): DiffLine[] {
	const leftWidth = Math.max(16, Math.floor((width - PAD * 2 - 5) / 2));
	const rows: DiffLine[] = [];
	const deletes: string[] = [];
	const additions: string[] = [];
	const flush = () => {
		const max = Math.max(deletes.length, additions.length);
		for (let at = 0; at < max; at++) {
			const before = deletes[at] ?? '';
			const after = additions[at] ?? '';
			rows.push({
				kind: before && !after ? 'del' : after ? 'add' : 'same',
				text: `${before ? '-' : ' '} ${before.slice(0, leftWidth).padEnd(leftWidth)} │ ${
					after ? '+' : ' '
				} ${after}`,
			});
		}
		deletes.length = 0;
		additions.length = 0;
	};
	for (const line of lines(unifiedDiff(file.rel, file.oldText, file.newText).patch)) {
		if (line.startsWith('---') || line.startsWith('+++')) {
			flush();
			rows.push({ kind: 'meta', text: line });
		} else if (line[0] === '-') deletes.push(line.slice(1));
		else if (line[0] === '+') additions.push(line.slice(1));
		else {
			flush();
			if (line[0] === ' ') {
				const text = line.slice(1);
				rows.push({
					kind: 'same',
					text: `  ${text.slice(0, leftWidth).padEnd(leftWidth)} │   ${text}`,
				});
			} else rows.push({ kind: 'meta', text: line });
		}
	}
	flush();
	return rows;
}

export function DiffView(props: { files: DiffFile[]; mode: DiffMode; onClose: () => void }) {
	const dimensions = useTerminalDimensions();
	const [index, setIndex] = createSignal(0);
	const [top, setTop] = createSignal(0);
	const width = () => modalWidth(dimensions().width, 0.82, 76, 120);
	const visibleRows = () => listRows(dimensions().height, 7, 24);
	const file = () => props.files[index()] ?? props.files[0]!;
	const diff = createMemo(() => unifiedDiff(file().rel, file().oldText, file().newText));
	const body = createMemo(() =>
		props.mode === 'split' ? split(file(), width()) : unified(file()),
	);
	const counts = () => ({
		adds: diff().adds,
		dels: diff().dels,
	});
	const maxTop = () => Math.max(0, body().length - visibleRows());
	const page = (delta: number) => setTop((at) => Math.max(0, Math.min(maxTop(), at + delta)));
	const switchFile = (delta: number) => {
		setIndex((at) => (at + delta + props.files.length) % props.files.length);
		setTop(0);
	};

	useKeyboard((key: KeyEvent) => {
		if (key.name === 'escape' || key.name === 'q') props.onClose();
		else if (key.name === 'up') page(-1);
		else if (key.name === 'down') page(1);
		else if (key.name === 'pageup') page(-visibleRows());
		else if (key.name === 'pagedown') page(visibleRows());
		else if (key.name === 'left') switchFile(-1);
		else if (key.name === 'right') switchFile(1);
		else return;
		key.preventDefault();
	});

	return (
		<Overlay zIndex={146}>
			<box
				width={width()}
				flexDirection="column"
				backgroundColor={ui.panelBg}
				border
				borderStyle="rounded"
				borderColor={ui.accent}
				title=" Diff "
				titleColor={ui.text}
				paddingLeft={PAD}
				paddingRight={PAD}
			>
				<box flexDirection="row" backgroundColor={ui.panelBg}>
					<text fg={ui.text} bg={ui.panelBg} content={`${file().rel} `} />
					<text fg={ui.gitAdded} bg={ui.panelBg} content={`+${counts().adds} `} />
					<text fg={ui.gitDeleted} bg={ui.panelBg} content={`-${counts().dels} `} />
					<text fg={ui.dim} bg={ui.panelBg} content={`${props.mode} `} />
					<Show when={props.files.length > 1}>
						<text
							fg={ui.dim}
							bg={ui.panelBg}
							content={`file ${index() + 1}/${props.files.length}`}
						/>
					</Show>
				</box>
				<For each={body().slice(top(), top() + visibleRows())}>
					{(row) => (
						<text
							fg={
								row.kind === 'add'
									? ui.gitAdded
									: row.kind === 'del'
										? ui.gitDeleted
										: row.kind === 'meta'
											? ui.faint
											: ui.dim
							}
							bg={ui.panelBg}
							content={row.text.slice(0, width() - PAD * 2 - 2)}
						/>
					)}
				</For>
				<text fg={ui.dim} bg={ui.panelBg} content="↑↓ scroll · ←→ file · Esc close" />
			</box>
		</Overlay>
	);
}
