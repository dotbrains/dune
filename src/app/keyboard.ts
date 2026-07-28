import { dirname } from 'node:path';

import type { KeyEvent } from '@opentui/core';
import { useKeyboard } from '@opentui/solid';

import type { Config } from '../core/config';
import type { TreeNode } from '../core/fs';
import type { VimMode } from '../editor/vim';
import type { Focus, Prompt } from './types';

const chord = (key: KeyEvent) => key.shift || key.option || key.meta;

export function useAppKeyboard(deps: {
	config: Config;
	activePath: () => string | null;
	clipboard: () => { paths: string[]; mode: 'cut' | 'copy' };
	focus: () => Focus;
	help: () => boolean;
	marked: () => string[];
	notice: () => { name: string; reason: string } | null;
	overlay: () => boolean;
	peek: () => boolean;
	selectedNode: () => TreeNode | undefined;
	sidebar: () => boolean;
	vimMode: () => VimMode | null;
	activateNode: (node: TreeNode) => void;
	actionTargets: () => string[];
	closeTab: (path: string) => void;
	extendSelection: (delta: number) => void;
	focusTree: () => void;
	moveSelection: (delta: number) => void;
	nudgeSidebar: (delta: number) => void;
	paste: () => void;
	quit: () => void;
	reopenTab: () => void;
	saveActive: () => void;
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
	setAnchor: (path: string | null) => void;
	setClipboard: (clipboard: { paths: string[]; mode: 'cut' | 'copy' }) => void;
	setFocus: (focus: Focus) => void;
	setHelp: (show: boolean) => void;
	setMarked: (paths: string[]) => void;
	setNotice: (notice: { name: string; reason: string } | null) => void;
	setPalette: (open: boolean) => void;
	setPeek: (update: (open: boolean) => boolean) => void;
	setPicker: (picker: 'files' | 'tabs' | null) => void;
	setPrompt: (prompt: Prompt) => void;
	setSearch: (search: { scope: 'file' | 'project'; replacing?: boolean } | null) => void;
	setSelectedPath: (path: string | null) => void;
	switchTab: (delta: number) => void;
	takeForPaste: (mode: 'cut' | 'copy') => void;
	targetDir: () => string;
	toggleExpand: (path: string) => void;
	toggleSidebar: () => void;
	expanded: () => Set<string>;
}) {
	useKeyboard((key: KeyEvent) => {
		const k = key.name;
		if (deps.help()) {
			if (k === 'escape') deps.setHelp(false);
			return;
		}
		if (deps.overlay()) return;
		if (deps.notice()) deps.setNotice(null);
		const claim = (run: () => void) => {
			key.preventDefault();
			run();
		};
		if (key.ctrl && k === 'k') return claim(() => deps.setPeek((p) => !p));
		if (deps.peek()) deps.setPeek(() => false);
		if (key.ctrl && k === 'q') return claim(deps.quit);
		if (key.ctrl && k === 'c' && deps.focus() !== 'editor') return claim(deps.quit);
		if (key.ctrl && k === 'p') return claim(() => deps.setPalette(true));
		if (key.ctrl && k === 'o') return claim(() => deps.setPicker('files'));
		if (key.ctrl && chord(key) && k === 't') return claim(deps.reopenTab);
		if (key.ctrl && (k === 't' || k === 'up')) return claim(() => deps.setPicker('tabs'));
		if (key.ctrl && k === 'g') return claim(() => deps.setPrompt({ kind: 'gotoLine' }));
		if (key.ctrl && k === 's') return claim(deps.saveActive);
		const vimOwnsRedo = deps.config.vim && deps.focus() === 'editor' && deps.vimMode() !== 'insert';
		if (key.ctrl && k === 'r' && !vimOwnsRedo)
			return claim(() => deps.setSearch({ scope: 'project' }));
		if (key.ctrl && chord(key) && k === 'f')
			return claim(() => deps.setSearch({ scope: 'project' }));
		if (key.ctrl && k === 'f') return claim(() => deps.setSearch({ scope: 'file' }));
		if (key.ctrl && k === 'w') {
			return claim(() => void (deps.activePath() && deps.closeTab(deps.activePath()!)));
		}
		if (key.ctrl && chord(key) && k === 'n') {
			return claim(() => deps.setPrompt({ kind: 'newFolder', dir: deps.targetDir() }));
		}
		if (key.ctrl && k === 'n')
			return claim(() => deps.setPrompt({ kind: 'newFile', dir: deps.targetDir() }));
		if (key.ctrl && k === 'b') return claim(deps.toggleSidebar);
		if (key.ctrl && (k === 'pageup' || k === 'left')) return claim(() => deps.switchTab(-1));
		if (key.ctrl && (k === 'pagedown' || k === 'right')) return claim(() => deps.switchTab(1));
		if (deps.focus() === 'editor') {
			const vimOwnsEscape = deps.config.vim && deps.vimMode() !== 'normal';
			if (k === 'escape' && deps.sidebar() && !vimOwnsEscape) deps.focusTree();
			return;
		}
		if (key.ctrl || key.meta || key.option) return;
		key.preventDefault();
		const node = deps.selectedNode();
		switch (k) {
			case 'tab':
				if (deps.activePath()) deps.setFocus('editor');
				break;
			case 'up':
				if (key.shift) deps.extendSelection(-1);
				else deps.moveSelection(-1);
				break;
			case 'down':
				if (key.shift) deps.extendSelection(1);
				else deps.moveSelection(1);
				break;
			case 'right':
				if (node?.isDir && !deps.expanded().has(node.path)) deps.toggleExpand(node.path);
				else deps.moveSelection(1);
				break;
			case 'left':
				if (node?.isDir && deps.expanded().has(node.path)) deps.toggleExpand(node.path);
				else if (node) deps.setSelectedPath(dirname(node.path));
				break;
			case 'return':
			case 'enter':
				if (node) deps.activateNode(node);
				break;
			case '[':
				deps.nudgeSidebar(-2);
				break;
			case ']':
				deps.nudgeSidebar(2);
				break;
			case 'a':
				deps.setPrompt({ kind: key.shift ? 'newFolder' : 'newFile', dir: deps.targetDir() });
				break;
			case 'r':
				if (node) deps.setPrompt({ kind: 'rename', target: node.path });
				break;
			case 'x':
				deps.takeForPaste('cut');
				break;
			case 'c':
				deps.takeForPaste('copy');
				break;
			case 'p':
				deps.paste();
				break;
			case 'escape':
				if (deps.clipboard().paths.length > 0) {
					const cancelled = deps.clipboard().mode === 'cut' ? 'Move' : 'Copy';
					deps.setClipboard({ paths: [], mode: 'cut' });
					deps.say(`${cancelled} cancelled`);
				} else if (deps.marked().length > 0) {
					deps.setMarked([]);
					deps.setAnchor(null);
				}
				break;
			case 'd':
			case 'delete':
			case 'backspace': {
				const targets = deps.actionTargets();
				if (targets.length > 0) deps.setPrompt({ kind: 'delete', targets });
				break;
			}
		}
	});
}
