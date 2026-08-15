import { describe, expect, test } from 'bun:test';

import { getSyntaxStyle, segmentsIn, styleIdForGroup } from '../src/languages/highlight';
import { allSegments, parseHighlights, WHOLE } from './syntax';

const SOURCE = `import { useState } from 'react'

export function Panel({ title }: { title: string }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="panel" onClick={() => setOpen(!open)}>
      <Header.Title id={1}>{title}</Header.Title>
      <hr />
    </section>
  )
}
`;

/** What each group got painted on, as text. */
async function painted(filetype: string) {
	const segments = await allSegments(SOURCE, filetype);
	const lines = SOURCE.split('\n');
	const style = getSyntaxStyle();
	const byGroup = new Map<number, string[]>();
	for (const segment of segments) {
		const text = lines[segment.line]?.slice(segment.start, segment.end) ?? '';
		if (!text.trim()) continue;
		byGroup.set(segment.styleId, [...(byGroup.get(segment.styleId) ?? []), text]);
	}
	return (group: string) => byGroup.get(style.getStyleId(group)!) ?? [];
}

describe('jsx', () => {
	test('tag names are tags, not plain text', async () => {
		// Every tag and attribute used to render in the plain text colour, which is
		// most of what a component file is made of.
		const group = await painted('typescriptreact');

		expect(group('tag')).toContain('section');
		expect(group('tag')).toContain('hr');
	});

	// A dotted tag is one `member_expression`, whose halves the generic
	// `(identifier) @variable` / `(property_identifier) @variable.member` rules
	// capture as well. Groups paint most-specific-last regardless of query order
	// (more dot-segments wins), so a plain `@tag` on the property half loses
	// outright to `variable.member`'s two segments — left `Header.Title` painted
	// as a variable and a property.
	test('a dotted tag name paints as a tag on both sides of the dot', async () => {
		const group = await painted('typescriptreact');

		expect(group('tag')).toContain('Header');
		expect(group('tag')).toContain('Title');
		expect(group('variable')).not.toContain('Header');
		expect(group('variable.member')).not.toContain('Title');
	});

	test('a three-deep dotted tag paints as a tag all the way down', async () => {
		const source = '<Radix.Slider.Thumb />\n';
		const line = source.split('\n')[0]!;
		const parsed = await parseHighlights(source, 'typescriptreact');
		const tagId = styleIdForGroup('tag');
		const tagged = segmentsIn(parsed, 0, WHOLE)
			.filter((segment) => segment.styleId === tagId)
			.map((segment) => line.slice(segment.start, segment.end));

		expect(tagged).toContain('Radix');
		expect(tagged).toContain('Slider');
		expect(tagged).toContain('Thumb');
	});

	test('attributes read as attributes', async () => {
		const group = await painted('typescriptreact');

		expect(group('attribute')).toContain('className');
		expect(group('attribute')).toContain('onClick');
		expect(group('attribute')).toContain('id');
	});

	test('calls are lit too', async () => {
		const group = await painted('typescriptreact');

		expect(group('function')).toContain('useState');
		expect(group('function')).toContain('setOpen');
	});

	test('the rest of the TypeScript keeps its own colours', async () => {
		const group = await painted('typescriptreact');

		expect(group('keyword')).toContain('import');
		expect(group('keyword')).toContain('return');
		expect(group('string')).toContain("'react'");
		expect(group('type')).toContain('string');
	});

	test('jsx applies to .jsx as well as .tsx', async () => {
		const group = await painted('javascriptreact');

		expect(group('tag')).toContain('section');
		expect(group('attribute')).toContain('className');
	});
});
