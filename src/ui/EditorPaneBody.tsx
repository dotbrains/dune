import type { MouseEvent, TextareaRenderable } from '@opentui/core';
import { For, Show } from 'solid-js';

import type { LineChange } from '../core/git';
import { getSyntaxStyle } from '../languages/highlight';
import { ui } from '../themes';

const CHANGE_COLORS: Record<LineChange, () => string> = {
	added: () => ui.gitAdded,
	modified: () => ui.gitModified,
	deleted: () => ui.gitDeleted,
};

export interface GutterHost {
	gutter?: { _minWidth?: number };
	setLineSigns?: (signs: Map<number, { before?: string; beforeColor?: string }>) => void;
}

export function EditorPaneBody(props: {
	content: string;
	focused: boolean;
	tabSize: number;
	editorEl: TextareaRenderable | null;
	cursorLine: number;
	gutterWidth: number;
	changeTrack: (LineChange | undefined)[];
	scrollbar: boolean[];
	dragging: boolean;
	onFocus: () => void;
	onDrag: (event: MouseEvent) => void;
	onDragEnd: () => void;
	onGutter: (el: unknown) => void;
	onEditor: (el: TextareaRenderable) => void;
	onContentChange: () => void;
	onMouse: () => void;
	onCursorChange: () => void;
	onJumpTrack: (row: number) => void;
	onStartScrollbarDrag: (y: number) => void;
	onTrack: (el: { y: number }) => void;
}) {
	return (
		<box
			flexGrow={1}
			flexDirection="row"
			backgroundColor={ui.bg}
			onMouseDown={props.onFocus}
			onMouseDrag={props.onDrag}
			onMouseDragEnd={props.onDragEnd}
			onMouseUp={props.onDragEnd}
		>
			<line_number
				ref={props.onGutter}
				target={props.editorEl ?? undefined}
				fg={ui.gutter}
				bg={ui.bg}
				minWidth={props.gutterWidth}
				paddingRight={1}
				flexGrow={1}
				lineColors={
					new Map([[props.cursorLine, { gutter: ui.currentLine, content: ui.currentLine }]])
				}
			>
				<textarea
					ref={props.onEditor}
					initialValue={props.content}
					focused={props.focused}
					syntaxStyle={getSyntaxStyle()}
					backgroundColor={ui.bg}
					textColor={ui.text}
					focusedBackgroundColor={ui.bg}
					focusedTextColor={ui.text}
					cursorColor={ui.cursor}
					wrapMode="word"
					tabIndicator={props.tabSize}
					tabIndicatorColor={ui.indentGuide}
					flexGrow={1}
					paddingLeft={1}
					onContentChange={props.onContentChange}
					onMouse={props.onMouse}
					onCursorChange={props.onCursorChange}
				/>
			</line_number>
			<Show when={props.changeTrack.some(Boolean)}>
				<box
					width={1}
					flexShrink={0}
					backgroundColor={ui.bg}
					onMouseDown={(event: MouseEvent) => {
						if (!props.dragging) props.onJumpTrack(event.y);
					}}
				>
					<For each={props.changeTrack}>
						{(change) => (
							<text
								fg={change ? CHANGE_COLORS[change]() : ui.bg}
								bg={ui.bg}
								content={change ? '▎' : ' '}
							/>
						)}
					</For>
				</box>
			</Show>
			<Show when={props.scrollbar.length > 0}>
				<box
					ref={props.onTrack}
					width={1}
					flexShrink={0}
					backgroundColor={ui.bg}
					onMouseDown={(event: MouseEvent) => props.onStartScrollbarDrag(event.y)}
				>
					<For each={props.scrollbar}>
						{(filled) => (
							<text fg={filled ? ui.scrollbar : ui.bg} bg={ui.bg} content={filled ? '█' : '│'} />
						)}
					</For>
				</box>
			</Show>
		</box>
	);
}
