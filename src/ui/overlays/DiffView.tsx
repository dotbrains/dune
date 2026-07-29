import type { KeyEvent } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import { createMemo, createSignal, For, Show } from 'solid-js';

import type { DiffFile } from '../../core/git';
import { ui } from '../../themes';
import { listRows, modalWidth, PAD } from '../modal';
import { Overlay } from '../Overlay';

interface DiffLine {
	text: string;
	kind: 'meta' | 'same' | 'add' | 'del';
}

function lines(text: string): string[] {
	if (text.length === 0) return [];
	const out = text.split('\n');
	if (out.at(-1) === '') out.pop();
	return out;
}

function unified(file: DiffFile): DiffLine[] {
	const oldLines = lines(file.oldText);
	const newLines = lines(file.newText);
	const rows: DiffLine[] = [
		{ kind: 'meta', text: `--- ${oldLines.length === 0 ? '/dev/null' : `a/${file.rel}`}` },
		{ kind: 'meta', text: `+++ ${newLines.length === 0 ? '/dev/null' : `b/${file.rel}`}` },
	];
	let oldAt = 0;
	let newAt = 0;
	while (oldAt < oldLines.length || newAt < newLines.length) {
		if (oldLines[oldAt] === newLines[newAt]) {
			rows.push({ kind: 'same', text: `  ${oldLines[oldAt++]}` });
			newAt++;
		} else {
			if (oldAt < oldLines.length) rows.push({ kind: 'del', text: `- ${oldLines[oldAt++]}` });
			if (newAt < newLines.length) rows.push({ kind: 'add', text: `+ ${newLines[newAt++]}` });
		}
	}
	return rows;
}

export function DiffView(props: { files: DiffFile[]; onClose: () => void }) {
	const dimensions = useTerminalDimensions();
	const [index, setIndex] = createSignal(0);
	const [top, setTop] = createSignal(0);
	const width = () => modalWidth(dimensions().width, 0.82, 76, 120);
	const visibleRows = () => listRows(dimensions().height, 7, 24);
	const file = () => props.files[index()] ?? props.files[0]!;
	const body = createMemo(() => unified(file()));
	const counts = () => ({
		adds: body().filter((row) => row.kind === 'add').length,
		dels: body().filter((row) => row.kind === 'del').length,
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
