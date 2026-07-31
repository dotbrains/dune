import type { KeyEvent } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import { createMemo, createSignal, For, Show } from 'solid-js';

import { splitText, unifiedDiff } from '../../core/diff';
import type { DiffFile } from '../../core/git';
import { fuzzyScore } from '../../core/search';
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
	const [pickIndex, setPickIndex] = createSignal(0);
	const [picker, setPicker] = createSignal(false);
	const [filter, setFilter] = createSignal('');
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
	const fileCounts = createMemo(() =>
		props.files.map((changed, originalIndex) => ({
			file: changed,
			originalIndex,
			diff: unifiedDiff(changed.rel, changed.oldText, changed.newText),
		})),
	);
	const filteredFileCounts = createMemo(() => {
		const query = filter().trim();
		if (!query) return fileCounts();
		return fileCounts().filter((row) => fuzzyScore(row.file.rel, query) !== null);
	});
	const totalCounts = () => ({
		adds: fileCounts().reduce((total, row) => total + row.diff.adds, 0),
		dels: fileCounts().reduce((total, row) => total + row.diff.dels, 0),
	});
	const maxTop = () => Math.max(0, body().length - visibleRows());
	const page = (delta: number) => setTop((at) => Math.max(0, Math.min(maxTop(), at + delta)));
	const switchFile = (delta: number) => {
		setIndex((at) => (at + delta + props.files.length) % props.files.length);
		setTop(0);
	};
	const pickFile = (at: number) => {
		const row = filteredFileCounts()[at];
		if (!row) return;
		setIndex(row.originalIndex);
		setTop(0);
		setPicker(false);
	};
	const openPicker = () => {
		const current = index();
		setFilter('');
		setPickIndex(fileCounts().findIndex((row) => row.originalIndex === current));
		setPicker(true);
	};
	const setPickerFilter = (value: string) => {
		setFilter(value);
		setPickIndex(0);
	};

	useKeyboard((key: KeyEvent) => {
		if (picker()) {
			const typed = key.sequence;
			const printable =
				typed?.length === 1 && typed >= ' ' && typed !== '\u007F' && !key.ctrl && !key.meta;
			const count = Math.max(1, filteredFileCounts().length);
			if (key.name === 'escape' || key.name === 'q') setPicker(false);
			else if (key.name === 'up') setPickIndex((at) => (at - 1 + count) % count);
			else if (key.name === 'down') setPickIndex((at) => (at + 1) % count);
			else if (key.name === 'backspace') setPickerFilter(filter().slice(0, -1));
			else if (key.name === 'return' || key.name === 'enter') pickFile(pickIndex());
			else if (printable) setPickerFilter(`${filter()}${typed}`);
			else return;
		} else if (key.name === 'escape' || key.name === 'q') props.onClose();
		else if (key.name === 'f' && props.files.length > 1) {
			openPicker();
		} else if (key.name === 'up') page(-1);
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
				<Show
					when={picker()}
					fallback={
						<>
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
							<text
								fg={ui.dim}
								bg={ui.panelBg}
								content="↑↓ scroll · ←→ file · F files · Esc close"
							/>
						</>
					}
				>
					<box flexDirection="row" backgroundColor={ui.panelBg}>
						<text fg={ui.text} bg={ui.panelBg} content={`Changed files — ${props.files.length} `} />
						<text fg={ui.gitAdded} bg={ui.panelBg} content={`+${totalCounts().adds} `} />
						<text fg={ui.gitDeleted} bg={ui.panelBg} content={`-${totalCounts().dels}`} />
					</box>
					<Show when={filter()}>
						<text
							fg={ui.dim}
							bg={ui.panelBg}
							content={`Filter: ${filter()} (${filteredFileCounts().length}/${props.files.length})`.slice(
								0,
								width() - PAD * 2 - 2,
							)}
						/>
					</Show>
					<For each={filteredFileCounts().slice(0, visibleRows())}>
						{(row, at) => {
							const active = () => at() === pickIndex();
							const bg = () => (active() ? ui.treeSelectedBg : ui.panelBg);
							const prefix = () => (active() ? '▌ ' : '  ');
							const label = () =>
								`${prefix()}${row.file.rel} +${row.diff.adds} -${row.diff.dels}`.slice(
									0,
									width() - PAD * 2 - 2,
								);
							return <text fg={active() ? ui.text : ui.dim} bg={bg()} content={label()} />;
						}}
					</For>
					<Show when={filteredFileCounts().length === 0}>
						<text fg={ui.dim} bg={ui.panelBg} content="No changed files match." />
					</Show>
					<text
						fg={ui.dim}
						bg={ui.panelBg}
						content="Type filter · ↑↓ choose · Enter jump · Esc diff"
					/>
				</Show>
			</box>
		</Overlay>
	);
}
