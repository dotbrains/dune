import type { Prompt } from './types';

const PROMPT_TITLES: Partial<Record<NonNullable<Prompt>['kind'], string>> = {
	newFile: 'New file name',
	newFolder: 'New folder name',
	rename: 'Rename to',
	formatterCommand: 'Formatter: extensions = command',
	lspServerCommand: 'LSP override: server = command',
	typescriptTsdk: 'TypeScript SDK path',
	keybindingCommand: 'Shortcut: command = key',
	sidebarWidth: 'Sidebar width: auto or columns',
	appearancePluginId: 'Plugin id',
	appearancePluginRemoveId: 'Remove plugin id',
	appearancePluginRegistry: 'Plugin registry URL',
	gotoLine: 'Go to line',
	commitMessage: 'Commit message',
	newBranch: 'New branch name',
	renameBranch: 'Rename branch to',
};

export function promptTitleFor(prompt: Prompt): string | undefined {
	if (prompt?.kind === 'newBranch' && prompt.from) return `New branch from ${prompt.from}`;
	return prompt ? PROMPT_TITLES[prompt.kind] : undefined;
}

export function isTextPrompt(prompt: Prompt): boolean {
	return !!promptTitleFor(prompt);
}
