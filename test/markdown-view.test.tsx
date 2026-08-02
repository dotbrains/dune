import { expect, test } from 'bun:test';

import {
	fixture,
	launch,
	openFile,
	press,
	pressEscape,
	runCommand,
	settle,
	until,
} from './helpers';

const DOC = `# Title

Some **bold** prose.

- first item
- second item

\`\`\`ts
const a = 1
\`\`\`
`;

test('a markdown tab renders its document and switches back to source', async () => {
	const t = await launchDoc();
	await runCommand(t, 'Markdown: rendered');
	await until(t, () => t.captureCharFrame().includes('Title'));

	const rendered = t.captureCharFrame();
	expect(rendered).toContain('Title');
	expect(rendered).not.toContain('# Title');
	expect(rendered).toContain('bold');
	expect(rendered).toContain('first item');
	expect(rendered).toContain('const a = 1');
	expect(rendered).toContain('¶ doc.md');

	await runCommand(t, 'Markdown: rendered');
	await until(t, () => t.captureCharFrame().includes('# Title'));
	expect(t.captureCharFrame()).not.toContain('¶ doc.md');
});

test('Esc in the rendered page returns to the markdown source', async () => {
	const t = await launchDoc();
	await runCommand(t, 'Markdown: rendered');
	await until(t, () => t.captureCharFrame().includes('Title'));

	await pressEscape(t);
	await until(t, () => t.captureCharFrame().includes('# Title'));
	expect(t.captureCharFrame()).toContain('# Title');
});

test('e in the rendered page returns to the markdown source', async () => {
	const t = await launchDoc();
	await runCommand(t, 'Markdown: rendered');
	await until(t, () => t.captureCharFrame().includes('Title'));

	await press(t, (input) => input.pressKey('e'));
	await until(t, () => t.captureCharFrame().includes('# Title'));
	expect(t.captureCharFrame()).toContain('# Title');
});

test('the rendered page uses the unsaved buffer text', async () => {
	const t = await launchDoc('# Saved\n');
	await press(t, (input) => void input.typeText('# Typed\n'));
	await runCommand(t, 'Markdown: rendered');
	await until(t, () => t.captureCharFrame().includes('Typed'));

	expect(t.captureCharFrame()).toContain('Typed');
});

test('non-markdown files warn instead of switching views', async () => {
	const t = await fixtureWithFile('a.ts', 'const a = 1\n');
	await runCommand(t, 'Markdown: rendered');
	await settle(t);

	expect(t.captureCharFrame()).toContain('Not a markdown file');
	expect(t.captureCharFrame()).toContain('const a = 1');
});

async function launchDoc(content = DOC) {
	return fixtureWithFile('doc.md', content);
}

async function fixtureWithFile(name: string, content: string) {
	const t = await launch(fixture({ [name]: content }));
	await openFile(t, name);
	return t;
}
