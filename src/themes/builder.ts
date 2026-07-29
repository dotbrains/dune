import type { StyleDefinitionInput } from '@opentui/core';
import type { Theme, ThemeUi } from './types';

interface ThemeColors {
	bg: string;
	panel: string;
	bar: string;
	line: string;
	guide: string;
	text: string;
	dim: string;
	faint: string;
	accent: string;
	accentText: string;
	selection: string;
	focus: string;
	warn: string;
	error: string;
	folder: string;
	cursor: string;
	scrollbar: string;
	gutter: string;
	added: string;
	modified: string;
	deleted: string;
	comment: string;
	keyword: string;
	string: string;
	number: string;
	function: string;
	type: string;
	variable: string;
	property: string;
	tag: string;
	operator: string;
	punctuation: string;
	label: string;
}

const syntaxFrom = (c: ThemeColors): Record<string, StyleDefinitionInput> => ({
	comment: { fg: c.comment, italic: true },
	keyword: { fg: c.keyword },
	'keyword.operator': { fg: c.operator },
	operator: { fg: c.operator },
	string: { fg: c.string },
	escape: { fg: c.label },
	number: { fg: c.number },
	boolean: { fg: c.number },
	constant: { fg: c.number },
	function: { fg: c.function },
	constructor: { fg: c.function },
	type: { fg: c.type },
	namespace: { fg: c.property },
	variable: { fg: c.variable },
	'variable.builtin': { fg: c.keyword },
	'variable.member': { fg: c.text },
	property: { fg: c.property },
	attribute: { fg: c.property },
	tag: { fg: c.tag },
	label: { fg: c.label },
	punctuation: { fg: c.punctuation },
	'punctuation.special': { fg: c.operator },
	embedded: { fg: c.text },
	error: { fg: c.error },
	'markup.heading': { fg: c.accent, bold: true },
	'markup.strong': { fg: c.text, bold: true },
	'markup.italic': { fg: c.text, italic: true },
	'markup.raw': { fg: c.string },
	'markup.link': { fg: c.string },
	'markup.link.label': { fg: c.property },
	'markup.link.url': { fg: c.string, underline: true },
	'markup.list': { fg: c.keyword },
	'markup.quote': { fg: c.comment, italic: true },
});

const uiFrom = (c: ThemeColors): ThemeUi => ({
	bg: c.bg,
	panelBg: c.panel,
	barBg: c.bar,
	statusBg: c.accent,
	statusFg: c.accentText,
	text: c.text,
	dim: c.dim,
	faint: c.faint,
	accent: c.accent,
	activeTabFg: c.text,
	inactiveTabFg: c.faint,
	treeSelectedBg: c.selection,
	treeFocusBg: c.focus,
	dirty: c.warn,
	error: c.error,
	folder: c.folder,
	cursor: c.cursor,
	scrollbar: c.scrollbar,
	gutter: c.gutter,
	currentLine: c.line,
	indentGuide: c.guide,
	gitAdded: c.added,
	gitModified: c.modified,
	gitDeleted: c.deleted,
});

export function defineTheme(name: string, colors: ThemeColors): Theme {
	return { name, ui: uiFrom(colors), syntax: syntaxFrom(colors) };
}
