import { isMarkdownPath } from '../core/markdown';

export function createMarkdownView(deps: {
	activePath: () => string | null;
	renderedMarkdown: () => string[];
	setRenderedMarkdown: (update: (prev: string[]) => string[]) => void;
	setFocus: (focus: 'tree' | 'editor') => void;
	say: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
}) {
	const renderedMarkdownPath = () => {
		const path = deps.activePath();
		return path && deps.renderedMarkdown().includes(path) && isMarkdownPath(path) ? path : null;
	};
	const toggleMarkdown = () => {
		const path = deps.activePath();
		if (!path || !isMarkdownPath(path)) return deps.say('Not a markdown file', 'warn');
		const rendered = !deps.renderedMarkdown().includes(path);
		deps.setRenderedMarkdown((prev) =>
			rendered ? [...prev, path] : prev.filter((p) => p !== path),
		);
		deps.setFocus('editor');
		deps.say(rendered ? `Rendering ${path.slice(path.lastIndexOf('/') + 1)}` : 'Markdown source');
	};
	return { renderedMarkdownPath, toggleMarkdown };
}
