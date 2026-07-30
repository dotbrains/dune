export interface RpcMessage {
	jsonrpc?: '2.0';
	id?: number | string | null;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string };
}

export interface Position {
	line: number;
	character: number;
}

export interface Range {
	start: Position;
	end: Position;
}

export interface TextEdit {
	range: Range;
	newText: string;
}

export interface InsertReplaceEdit {
	insert: Range;
	replace: Range;
	newText: string;
}

export interface CompletionItem {
	label: string;
	kind?: number;
	detail?: string;
	filterText?: string;
	sortText?: string;
	insertText?: string;
	insertTextFormat?: number;
	textEdit?: TextEdit | InsertReplaceEdit;
	additionalTextEdits?: TextEdit[];
}

export interface CompletionList {
	isIncomplete?: boolean;
	items: CompletionItem[];
}
