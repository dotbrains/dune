import { basename } from 'node:path';

import type { KeyEvent, MouseEvent } from '@opentui/core';
import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import { createSignal, For, Show } from 'solid-js';

import type { Config } from '../core/config';
import type { TreeNode } from '../core/fs';
import type { FileStatus, LineChange, Upstream } from '../core/git';
import type { DiffFile } from '../core/git';
import { isImagePath } from '../core/image';
import type { Match } from '../core/search';
import type { VimMode } from '../editor/vim';
import { languageLabel } from '../languages';
import { filetypeForPath } from '../languages/highlight';
import { ui } from '../themes';
import { ChoiceModal } from '../ui/ChoiceModal';
import { CommandPalette } from '../ui/CommandPalette';
import { CommitModal } from '../ui/CommitModal';
import type { CommitFile } from '../ui/CommitModal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { DiffView } from '../ui/overlays/DiffView';
import { EditorPane } from '../ui/EditorPane';
import { FilePicker } from '../ui/FilePicker';
import { FileTree } from '../ui/FileTree';
import { HelpOverlay } from '../ui/HelpOverlay';
import { ImageView } from '../ui/ImageView';
import { KeyPeek } from '../ui/KeyPeek';
import { MarkdownView } from '../ui/MarkdownView';
import { Overlay } from '../ui/Overlay';
import { GitPanel } from '../ui/overlays/GitPanel';
import { PromptModal } from '../ui/PromptModal';
import { SearchPanel } from '../ui/SearchPanel';
import type { SearchScope } from '../ui/SearchPanel';
import { StatusBar } from '../ui/StatusBar';
import type { Tone } from '../ui/StatusBar';
import { Tabs } from '../ui/Tabs';
import { UpdateBanner } from '../ui/UpdateBanner';
import type { SearchOptions } from '../core/search';
import type { UpdateInfo } from '../core/update';
import type { Command } from './commands';
import type { SettingRow } from './settingsRows';
import type { BufferState, Confirmation, Conflict, Focus } from './types';
import { listRows, modalWidth, PAD } from '../ui/modal';

const GRIP = [0, 1, 2, 3, 4];

interface AppViewProps {
	rootDir: string;
	config: Config;
	tabs: string[];
	activePath: string | null;
	renderedMarkdownPath: string | null;
	activeBuffer: BufferState | undefined;
	buffers: Record<string, BufferState>;
	previewPath: string | null;
	sidebar: boolean;
	nodes: TreeNode[];
	selectedPath: string | null;
	expanded: Set<string>;
	focus: Focus;
	treeWidth: number;
	gitStatus: Map<string, FileStatus>;
	gitIgnored: Set<string>;
	cutPaths: string[];
	markedPaths: string[];
	resizing: boolean;
	reloadKey: number;
	goto: { line: number; col: number; key: number } | null;
	history: { kind: 'undo' | 'redo'; key: number } | null;
	edit: { content: string; key: number } | null;
	lineOp: { op: 'comment' | 'up' | 'down' | 'duplicate'; key: number } | null;
	gitLines: Map<number, LineChange>;
	notice: { name: string; reason: string } | null;
	blocked: boolean;
	status: { msg: string; tone: Tone };
	cursor: { line: number; col: number };
	vimMode: VimMode | null;
	branch: string | null;
	upstream: Upstream | null;
	busy: { label: string; done: number; total: number } | null;
	promptTitle: string | undefined;
	promptValue: string;
	confirmation: Confirmation | null;
	search: { scope: SearchScope; replacing?: boolean } | null;
	picker: 'files' | 'tabs' | null;
	gitPanel: boolean;
	palette: boolean;
	settingsPage: boolean;
	settingsScope: 'user' | 'project';
	diff: DiffFile[] | null;
	commands: Command[];
	settingRows: SettingRow[];
	commitFiles: CommitFile[] | null;
	conflict: Conflict | null;
	update: { current: string; latest: string } | null;
	peek: boolean;
	help: boolean;
	selection: string;
	onSelectTab: (path: string) => void;
	onCloseTab: (path: string) => void;
	onOverflowTabs: () => void;
	onResizeDrag: (event: MouseEvent) => void;
	onResizeEnd: () => void;
	onActivateNode: (node: TreeNode) => void;
	onPinNode: (node: TreeNode) => void;
	onTreeFocus: () => void;
	onGitDiff: (path: string) => void;
	onGitCommit: () => void;
	onGitPush: () => void;
	onResizeStart: (event: MouseEvent) => void;
	onEditorChange: (text: string) => void;
	onCursor: (pos: { line: number; col: number }) => void;
	onEditorFocus: () => void;
	onVimMode: (mode: VimMode | null) => void;
	onToggleMarkdown: () => void;
	onQuit: () => void;
	onSubmitPrompt: (value: string) => void;
	onCancelPrompt: () => void;
	onConfirmPrompt: () => void;
	onPickSearch: (match: Match) => void;
	onReplaceOne?: (match: Match, replacement: string) => void;
	onReplaceAll?: (query: string, replacement: string, options: SearchOptions) => void;
	onCloseSearch: () => void;
	onPickFile: (path: string) => void;
	onClosePicker: () => void;
	onClosePalette: () => void;
	onCloseSettings: () => void;
	onCloseDiff: () => void;
	onCommitFiles: (paths: string[]) => void;
	onCancelCommit: () => void;
	onResolveConflict: (choice: string) => void;
	onCancelConflict: () => void;
	onCloseUpdate: () => void;
	onSkipUpdate: () => void;
}

function SettingsView(props: {
	rows: SettingRow[];
	scope: 'user' | 'project';
	onClose: () => void;
}) {
	const dimensions = useTerminalDimensions();
	const [index, setIndex] = createSignal(0);
	const width = () => modalWidth(dimensions().width, 0.64, 64, 96);
	const visibleRows = () => listRows(dimensions().height, 8, 18);
	const selected = () => Math.min(index(), Math.max(0, props.rows.length - 1));
	const windowStart = () =>
		Math.max(0, Math.min(selected() - visibleRows() + 1, props.rows.length));
	const visible = () => props.rows.slice(windowStart(), windowStart() + visibleRows());
	const change = (dir: 1 | -1) => props.rows[selected()]?.change(dir);

	useKeyboard((key: KeyEvent) => {
		const count = Math.max(1, props.rows.length);
		if (key.name === 'up') setIndex((selected() - 1 + count) % count);
		else if (key.name === 'down') setIndex((selected() + 1) % count);
		else if (key.name === 'left') change(-1);
		else if (key.name === 'right' || key.name === 'return' || key.name === 'enter') change(1);
		else if (key.name === 'escape') props.onClose();
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
				<For each={visible()}>
					{(row, i) => {
						const absolute = () => windowStart() + i();
						const active = () => absolute() === selected();
						const bg = () => (active() ? ui.treeSelectedBg : ui.panelBg);
						const previous = () => props.rows[absolute() - 1];
						return (
							<>
								<text
									fg={previous()?.section === row.section ? ui.panelBg : ui.faint}
									bg={ui.panelBg}
									content={previous()?.section === row.section ? '' : row.section}
								/>
								<box flexDirection="row" backgroundColor={bg()}>
									<text fg={ui.accent} bg={bg()} flexShrink={0} content={active() ? '▌ ' : '  '} />
									<box flexGrow={1} backgroundColor={bg()}>
										<text fg={active() ? ui.text : ui.dim} bg={bg()} content={row.label} />
									</box>
									<text fg={active() ? ui.accent : ui.text} bg={bg()} content={` ${row.value} `} />
								</box>
							</>
						);
					}}
				</For>
				<text
					fg={ui.dim}
					bg={ui.panelBg}
					content="↑↓ move · ←→ change · Enter toggle · Esc close"
				/>
			</box>
		</Overlay>
	);
}

export function AppView(props: AppViewProps) {
	const dimensions = useTerminalDimensions();
	const activeImage = () =>
		props.activePath && isImagePath(props.activePath) ? props.activePath : null;
	const editorSlotFocused = () => props.focus === 'editor' || props.renderedMarkdownPath !== null;
	const editorWidth = () =>
		Math.max(1, dimensions().width - (props.sidebar ? props.treeWidth + 1 : 0));
	const editorHeight = () => Math.max(1, dimensions().height - 2);
	return (
		<box flexDirection="column" width="100%" height="100%" backgroundColor={ui.bg}>
			<Tabs
				tabs={props.tabs.map((p) => ({
					path: p,
					name: p === props.renderedMarkdownPath ? `¶ ${basename(p)}` : basename(p),
					dirty: props.buffers[p]?.dirty ?? false,
					preview: p === props.previewPath,
				}))}
				activePath={props.activePath}
				onSelect={props.onSelectTab}
				onClose={props.onCloseTab}
				onOverflow={() => props.onOverflowTabs()}
			/>
			{/* Drag capture lives on the row, not the divider: the pointer leaves a
          one-column target immediately, and each drag event is delivered to
          whatever sits under it. */}
			<box
				flexDirection="row"
				flexGrow={1}
				onMouseDrag={props.onResizeDrag}
				onMouseDragEnd={() => props.onResizeEnd()}
				onMouseUp={() => props.onResizeEnd()}
			>
				<Show when={props.sidebar}>
					<Show
						when={props.gitPanel}
						fallback={
							<FileTree
								rootName={basename(props.rootDir) || props.rootDir}
								nodes={props.nodes}
								selectedPath={props.selectedPath}
								expanded={props.expanded}
								focused={props.focus === 'tree'}
								width={props.treeWidth}
								gitStatus={props.gitStatus}
								gitIgnored={props.gitIgnored}
								cutPaths={props.cutPaths}
								markedPaths={props.markedPaths}
								onActivate={props.onActivateNode}
								onPin={(node) => props.onPinNode(node)}
								onFocus={() => props.onTreeFocus()}
							/>
						}
					>
						<GitPanel
							rootDir={props.rootDir}
							branch={props.branch}
							width={props.treeWidth}
							focused={props.focus === 'tree'}
							status={props.gitStatus}
							onFocus={() => props.onTreeFocus()}
							onDiff={props.onGitDiff}
							onCommit={props.onGitCommit}
							onPush={props.onGitPush}
						/>
					</Show>
					{/* Drag handle: the whole column is the grab target, but only a short
              grip is drawn at its middle — a full-height rule is a heavy line
              down the screen for something you touch once. The spacers centre it
              without anyone having to know the pane's height. `scrollbar` is the
              palette's quiet rule colour, and the accent while dragging says the
              grab took. The sidebar starts at column 0, so the pointer's x is the
              width asked for. */}
					<box
						width={1}
						flexShrink={0}
						flexDirection="column"
						backgroundColor={ui.bg}
						onMouseDown={props.onResizeStart}
					>
						<box flexGrow={1} backgroundColor={ui.bg} />
						<For each={GRIP}>
							{() => <text fg={props.resizing ? ui.accent : ui.scrollbar} bg={ui.bg} content="│" />}
						</For>
						<box flexGrow={1} backgroundColor={ui.bg} />
					</box>
				</Show>
				<Show
					when={activeImage()}
					fallback={
						<Show
							when={props.renderedMarkdownPath}
							fallback={
								<EditorPane
									path={props.activePath}
									content={props.activeBuffer?.content ?? ''}
									filetype={props.activePath ? filetypeForPath(props.activePath!) : undefined}
									focused={props.focus === 'editor'}
									theme={props.config.theme}
									reloadKey={props.reloadKey}
									goto={props.goto}
									history={props.history}
									edit={props.edit}
									lineOp={props.lineOp}
									vim={props.config.vim}
									tabSize={props.config.tabSize}
									gitLines={props.gitLines}
									notice={props.notice}
									blocked={props.blocked}
									onChange={props.onEditorChange}
									onCursor={props.onCursor}
									onFocus={props.onEditorFocus}
									onVimMode={props.onVimMode}
									onQuit={props.onQuit}
								/>
							}
						>
							{(path: () => string) => (
								<MarkdownView
									path={path()}
									name={basename(path())}
									content={props.activeBuffer?.content ?? ''}
									width={editorWidth()}
									theme={props.config.theme}
									focused={editorSlotFocused()}
									blocked={props.blocked}
									onFocus={props.onEditorFocus}
									onShowSource={props.onToggleMarkdown}
								/>
							)}
						</Show>
					}
				>
					{(path: () => string) => (
						<ImageView
							path={path()}
							width={editorWidth()}
							height={editorHeight()}
							onFocus={props.onEditorFocus}
						/>
					)}
				</Show>
			</box>
			<StatusBar
				message={props.status.msg}
				tone={props.status.tone}
				filetype={
					activeImage()
						? 'image'
						: props.renderedMarkdownPath
							? 'md'
							: props.activePath
								? languageLabel(filetypeForPath(props.activePath!) ?? 'plain')
								: undefined
				}
				cursor={
					props.activePath && !activeImage() && !props.renderedMarkdownPath
						? props.cursor
						: undefined
				}
				dirty={props.activeBuffer?.dirty ?? false}
				vimMode={
					props.activePath && !activeImage() && !props.renderedMarkdownPath ? props.vimMode : null
				}
				branch={props.branch}
				ahead={props.upstream?.ahead ?? 0}
				behind={props.upstream?.behind ?? 0}
				changed={props.gitStatus.size}
				focus={props.renderedMarkdownPath ? 'editor' : props.focus}
				busy={props.busy}
			/>

			<Show when={props.promptTitle}>
				{(title: () => string) => (
					<PromptModal
						title={title()}
						initialValue={props.promptValue}
						onSubmit={props.onSubmitPrompt}
						onCancel={() => props.onCancelPrompt()}
					/>
				)}
			</Show>
			<Show when={props.confirmation}>
				{(ask: () => Confirmation) => (
					<ConfirmModal
						title={ask().title}
						verb={ask().verb}
						danger={ask().danger}
						message={ask().message}
						onConfirm={props.onConfirmPrompt}
						onCancel={() => props.onCancelPrompt()}
					/>
				)}
			</Show>
			<Show when={props.search}>
				{(open: () => { scope: SearchScope; replacing?: boolean }) => {
					const search = open();
					return (
						<SearchPanel
							scope={search.scope}
							rootDir={props.rootDir}
							activePath={props.activePath}
							activeContent={props.activeBuffer?.content ?? ''}
							initialQuery={props.selection}
							replacing={search.replacing}
							onPick={props.onPickSearch}
							onReplaceOne={search.scope === 'file' ? props.onReplaceOne : undefined}
							onReplaceAll={search.scope === 'file' ? props.onReplaceAll : undefined}
							onClose={() => props.onCloseSearch()}
						/>
					);
				}}
			</Show>
			<Show when={props.picker}>
				{(kind: () => 'files' | 'tabs') => (
					<FilePicker
						rootDir={props.rootDir}
						files={kind() === 'tabs' ? props.tabs : undefined}
						title={kind() === 'tabs' ? 'Switch tab' : 'Open file'}
						onPick={(path) => {
							props.onClosePicker();
							props.onPickFile(path);
						}}
						onClose={() => props.onClosePicker()}
					/>
				)}
			</Show>
			<Show when={props.palette}>
				<CommandPalette commands={props.commands} onClose={() => props.onClosePalette()} />
			</Show>
			<Show when={props.settingsPage}>
				<SettingsView
					rows={props.settingRows}
					scope={props.settingsScope}
					onClose={() => props.onCloseSettings()}
				/>
			</Show>
			<Show when={props.diff}>
				{(files: () => DiffFile[]) => (
					<DiffView files={files()} mode={props.config.diffView} onClose={props.onCloseDiff} />
				)}
			</Show>
			<Show when={props.commitFiles}>
				{(files: () => CommitFile[]) => (
					<CommitModal
						rootDir={props.rootDir}
						files={files()}
						onCommit={props.onCommitFiles}
						onCancel={() => props.onCancelCommit()}
					/>
				)}
			</Show>
			<Show when={props.conflict}>
				{(c: () => Conflict) => (
					<ChoiceModal
						title={c().deleted ? 'File deleted on disk' : 'File changed on disk'}
						message={
							c().deleted
								? `"${basename(c().path)}" was deleted on disk and has unsaved edits here.`
								: `"${basename(c().path)}" changed on disk and has unsaved edits here.`
						}
						choices={
							c().deleted
								? [
										{ id: 'overwrite', label: 'Write it back (recreate the file)' },
										{ id: 'cancel', label: 'Cancel (keep editing)' },
									]
								: [
										{ id: 'overwrite', label: 'Overwrite (keep my version)' },
										{ id: 'reload', label: 'Reload (discard my changes)' },
										{ id: 'cancel', label: 'Cancel' },
									]
						}
						onPick={props.onResolveConflict}
						onCancel={() => props.onCancelConflict()}
					/>
				)}
			</Show>
			<Show when={props.update}>
				{(info: () => UpdateInfo) => (
					<UpdateBanner
						update={info()}
						onClose={() => props.onCloseUpdate()}
						onSkip={props.onSkipUpdate}
					/>
				)}
			</Show>
			<Show when={props.peek}>
				<KeyPeek pane={props.focus} />
			</Show>
			<Show when={props.help}>
				<HelpOverlay />
			</Show>
		</box>
	);
}
