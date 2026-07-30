import type { Prompt } from './types';

const PROMPT_TITLES: Partial<Record<NonNullable<Prompt>['kind'], string>> = {
	newFile: 'New file name',
	newFolder: 'New folder name',
	rename: 'Rename to',
	formatterCommand: 'Formatter: extensions = command',
	gotoLine: 'Go to line',
	commitMessage: 'Commit message',
};

export function promptTitleFor(prompt: Prompt): string | undefined {
	return prompt ? PROMPT_TITLES[prompt.kind] : undefined;
}

export function isTextPrompt(prompt: Prompt): boolean {
	return !!promptTitleFor(prompt);
}
