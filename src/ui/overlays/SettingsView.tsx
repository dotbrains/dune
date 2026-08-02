import type { KeyEvent } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import { createMemo, createSignal, For, Show } from 'solid-js';

import { ui } from '../../themes';
import { listRows, modalWidth, PAD } from '../modal';
import { Overlay } from '../Overlay';
import { TextInput } from '../TextInput';

export interface SettingRow {
	section: string;
	label: string;
	value: string;
	change: (dir: 1 | -1) => void;
}

export function SettingsView(props: {
	rows: SettingRow[];
	scope: 'user' | 'project';
	disabled?: boolean;
	onClose: () => void;
}) {
	const dimensions = useTerminalDimensions();
	const [index, setIndex] = createSignal(0);
	const [filtering, setFiltering] = createSignal(false);
	const [filter, setFilter] = createSignal('');
	const width = () => modalWidth(dimensions().width, 0.64, 64, 96);
	const visibleRows = () => listRows(dimensions().height, filtering() ? 7 : 5, 8);
	const rows = createMemo(() => {
		const query = filter().trim().toLowerCase();
		if (!query) return props.rows;
		return props.rows.filter((row) =>
			`${row.section} ${row.label} ${row.value}`.toLowerCase().includes(query),
		);
	});
	const selected = () => Math.min(index(), Math.max(0, rows().length - 1));
	const windowStart = () => Math.max(0, Math.min(selected() - visibleRows() + 1, rows().length));
	const visible = () => rows().slice(windowStart(), windowStart() + visibleRows());
	const change = (dir: 1 | -1) => rows()[selected()]?.change(dir);
	const typeFilter = (value: string) => {
		setFilter(value);
		setIndex(0);
	};

	useKeyboard((key: KeyEvent) => {
		if (props.disabled) return;
		if (filtering()) {
			if (key.name === 'escape') {
				if (filter()) {
					typeFilter('');
				} else {
					setFiltering(false);
				}
				key.preventDefault();
				return;
			}
			const printable =
				key.sequence?.length === 1 &&
				key.sequence >= ' ' &&
				key.sequence !== '\u007F' &&
				!key.ctrl &&
				!key.meta;
			if (printable || key.name === 'backspace' || key.name === 'delete') return;
		}
		const count = Math.max(1, rows().length);
		if (key.name === 'up') setIndex((selected() - 1 + count) % count);
		else if (key.name === 'down') setIndex((selected() + 1) % count);
		else if (key.name === 'left') change(-1);
		else if (key.name === 'right' || key.name === 'return' || key.name === 'enter') change(1);
		else if (key.sequence === '/') {
			setFiltering(true);
			typeFilter('');
		} else if (key.name === 'escape') props.onClose();
		else return;
		key.preventDefault();
	});

	return (
		<Overlay zIndex={145}>
			<box
				width={width()}
				flexDirection="column"
				backgroundColor={ui.panelBg}
				border
				borderStyle="rounded"
				borderColor={ui.accent}
				title={` Settings — ${props.scope === 'project' ? 'Project' : 'User'} `}
				titleColor={ui.text}
				paddingLeft={PAD}
				paddingRight={PAD}
			>
				<Show when={filtering()}>
					<TextInput value={filter()} placeholder="Filter settings" onInput={typeFilter} />
				</Show>
				<Show
					when={rows().length > 0}
					fallback={<text fg={ui.dim} bg={ui.panelBg} content="No matching settings" />}
				>
					<For each={visible()}>
						{(row, i) => {
							const absolute = () => windowStart() + i();
							const active = () => absolute() === selected();
							const bg = () => (active() ? ui.treeSelectedBg : ui.panelBg);
							const previous = () => rows()[absolute() - 1];
							return (
								<>
									<text
										fg={previous()?.section === row.section ? ui.panelBg : ui.faint}
										bg={ui.panelBg}
										content={previous()?.section === row.section ? '' : row.section}
									/>
									<box flexDirection="row" backgroundColor={bg()}>
										<text
											fg={ui.accent}
											bg={bg()}
											flexShrink={0}
											content={active() ? '▌ ' : '  '}
										/>
										<box flexGrow={1} backgroundColor={bg()}>
											<text fg={active() ? ui.text : ui.dim} bg={bg()} content={row.label} />
										</box>
										<text
											fg={active() ? ui.accent : ui.text}
											bg={bg()}
											content={` ${row.value} `}
										/>
									</box>
								</>
							);
						}}
					</For>
				</Show>
				<text
					fg={ui.dim}
					bg={ui.panelBg}
					content={
						filtering()
							? 'Type to filter · Esc clear'
							: '↑↓ move · ←→ change · Enter toggle · / filter · Esc close'
					}
				/>
			</box>
		</Overlay>
	);
}
