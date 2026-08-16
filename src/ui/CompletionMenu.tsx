import { TextAttributes } from '@opentui/core';
import type { RGBA } from '@opentui/core';
import { createEffect, createMemo, createSignal, For, Index, on, onCleanup, Show } from 'solid-js';

import { computeHighlights, segmentsIn, STALE, styleForId } from '../languages/highlight';
import type { Highlighted } from '../languages/highlight';
import { kindInfo, matchRuns } from '../lsp/completion';
import type { CompletionMatch, KindGroup } from '../lsp/completion';
import { ui } from '../themes';
import type { PanelLayout, SignatureLine } from './completionLayout';

export const COMPLETION_MENU_ROWS = 8;

const LABEL_MAX = 40;
const DETAIL_MAX = 28;
const MIN_WIDTH = 22;

export interface CompletionMenuProps {
	matches: CompletionMatch[];
	selected: number;
	top: number;
	left: number;
	width: number;
	/** Signature and docs for the selected item, sized once by EditorPane. */
	panelLayout: PanelLayout;
	/** The selected item's flattened signature — what the panel's colours come from. */
	detail: string;
	/** The open file's language, to parse that signature as. */
	filetype?: string;
}

/** A run of the signature painted as one `<text>`. */
interface Span {
	text: string;
	fg: string | RGBA;
	attributes: number;
}

const GROUP_COLORS: Record<KindGroup, () => string> = {
	fn: () => ui.accent,
	var: () => ui.gitModified,
	type: () => ui.folder,
	module: () => ui.gitAdded,
	keyword: () => ui.dim,
	text: () => ui.dim,
};

export function completionMenuWidth(matches: CompletionMatch[]): number {
	let label = 0;
	let detail = 0;
	for (const match of matches.slice(0, COMPLETION_MENU_ROWS)) {
		label = Math.max(label, Math.min(match.item.label.length, LABEL_MAX));
		detail = Math.max(detail, Math.min(match.item.detail?.length ?? 0, DETAIL_MAX));
	}
	return Math.max(MIN_WIDTH, 1 + 2 + label + (detail > 0 ? 2 + detail : 0) + 1 + 2);
}

const truncate = (text: string, room: number) =>
	text.length > room ? `${text.slice(0, Math.max(0, room - 1))}…` : text;

export function CompletionMenu(props: CompletionMenuProps) {
	const windowed = createMemo(() => {
		const start = Math.max(
			0,
			Math.min(
				props.selected - COMPLETION_MENU_ROWS + 1,
				props.matches.length - COMPLETION_MENU_ROWS,
			),
		);
		return { start, rows: props.matches.slice(start, start + COMPLETION_MENU_ROWS) };
	});
	const inner = () => props.width - 2;
	/** Reserved rows the current item did not fill; drawn blank so nothing moves. */
	const filler = () =>
		props.panelLayout.panelRows -
		props.panelLayout.signature.length -
		props.panelLayout.documentation.length -
		(props.panelLayout.origin ? 1 : 0);

	/**
	 * The selected item's signature parsed as code, so the panel reads as the
	 * declaration it is rather than as a paragraph. The whole flattened signature
	 * is parsed at once — one short line, and the layout kept each row's offset
	 * into it, so a wrapped signature colours as the thing it was before wrapping.
	 */
	const [parsed, setParsed] = createSignal<Highlighted | null>(null);
	createEffect(
		on([() => props.detail, () => props.filetype], ([detail, filetype]) => {
			setParsed(null);
			if (!detail || !filetype) return;
			let dropped = false;
			onCleanup(() => {
				dropped = true;
			});
			void (async () => {
				const doc = await computeHighlights(detail, filetype, 2, () => dropped);
				if (!dropped && doc !== STALE) setParsed(doc);
			})();
		}),
	);
	const captures = createMemo(() => {
		const doc = parsed();
		return doc ? segmentsIn(doc, 0, 0) : [];
	});

	/**
	 * One signature row as coloured pieces. Offsets are into the flattened
	 * signature, so a capture is sliced to the part of it this row holds; the
	 * ellipsis `capped` wrote over the last character rides along with it.
	 */
	const painted = (line: SignatureLine): Span[] => {
		const out: Span[] = [];
		const plain = ui.text;
		let col = 0;
		for (const segment of captures()) {
			const start = Math.max(segment.start - line.start, col);
			const end = Math.min(segment.end - line.start, line.text.length);
			if (end <= start) continue;
			const style = styleForId(segment.styleId);
			if (!style?.fg) continue;
			if (start > col) out.push({ text: line.text.slice(col, start), fg: plain, attributes: 0 });
			out.push({
				text: line.text.slice(start, end),
				fg: style.fg,
				attributes:
					(style.bold ? TextAttributes.BOLD : 0) | (style.italic ? TextAttributes.ITALIC : 0),
			});
			col = end;
		}
		if (col < line.text.length) out.push({ text: line.text.slice(col), fg: plain, attributes: 0 });
		return out;
	};

	return (
		<box
			position="absolute"
			top={props.top}
			left={props.left}
			width={props.width}
			zIndex={30}
			flexDirection="column"
			backgroundColor={ui.panelBg}
			border
			borderStyle="rounded"
			borderColor={ui.scrollbar}
		>
			<Show
				when={props.matches.length > 0}
				fallback={<text fg={ui.dim} bg={ui.panelBg} content=" No suggestions" />}
			>
				<For each={windowed().rows}>
					{(match, i) => {
						const active = () => windowed().start + i() === props.selected;
						const bg = () => (active() ? ui.treeSelectedBg : ui.panelBg);
						const kind = kindInfo(match.item.kind);
						const labelRoom = Math.min(Math.max(match.item.label.length, 1), inner() - 4);
						const detailRoom = () => inner() - 4 - labelRoom - 2;
						return (
							<box flexDirection="row" backgroundColor={bg()}>
								<text fg={ui.accent} bg={bg()} flexShrink={0} content={active() ? '▌' : ' '} />
								<text
									fg={GROUP_COLORS[kind.group]()}
									bg={bg()}
									flexShrink={0}
									content={`${kind.glyph} `}
								/>
								<box flexDirection="row" flexGrow={1}>
									<For each={matchRuns(truncate(match.item.label, labelRoom), match.positions)}>
										{(run) => (
											<text
												fg={run.hit ? ui.accent : active() ? ui.text : ui.dim}
												bg={bg()}
												content={run.text}
											/>
										)}
									</For>
								</box>
								<Show when={match.item.detail && detailRoom() >= 4}>
									<text
										fg={ui.faint}
										bg={bg()}
										flexShrink={0}
										content={` ${truncate(match.item.detail!.replaceAll(/\s+/g, ' '), detailRoom())} `}
									/>
								</Show>
							</box>
						);
					}}
				</For>
				<Show when={props.matches.length > COMPLETION_MENU_ROWS}>
					<box flexDirection="row" backgroundColor={ui.panelBg}>
						<box flexGrow={1} backgroundColor={ui.panelBg} />
						<text
							fg={ui.faint}
							bg={ui.panelBg}
							content={`${props.selected + 1}/${props.matches.length} `}
						/>
					</box>
				</Show>
				<Show when={props.panelLayout.panelRows > 0}>
					<text
						fg={ui.scrollbar}
						bg={ui.panelBg}
						wrapMode="none"
						content={'─'.repeat(Math.max(0, inner()))}
					/>
					<Index each={props.panelLayout.signature}>
						{(line) => (
							<box flexDirection="row" backgroundColor={ui.panelBg}>
								<text fg={ui.text} bg={ui.panelBg} flexShrink={0} content=" " />
								<For each={painted(line())}>
									{(span) => (
										<text
											fg={span.fg}
											bg={ui.panelBg}
											flexShrink={0}
											wrapMode="none"
											attributes={span.attributes}
											content={span.text}
										/>
									)}
								</For>
								<box flexGrow={1} backgroundColor={ui.panelBg} />
							</box>
						)}
					</Index>
					<Index each={props.panelLayout.documentation}>
						{(line) => <text fg={ui.dim} bg={ui.panelBg} wrapMode="none" content={` ${line()}`} />}
					</Index>
					<Show when={props.panelLayout.origin}>
						<text
							fg={ui.faint}
							bg={ui.panelBg}
							wrapMode="none"
							content={` ${props.panelLayout.origin}`}
						/>
					</Show>
					<box height={Math.max(0, filler())} backgroundColor={ui.panelBg} />
				</Show>
			</Show>
		</box>
	);
}
