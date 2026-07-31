import { expect, test } from 'bun:test';

import { changeRows } from '../../src/core/changeTree';

const changes = (...rels: string[]) =>
	rels
		.toSorted((a, b) => a.localeCompare(b))
		.map((rel) => ({ path: `/repo/${rel}`, rel, status: 'modified' as const }));

const shape = (rows: ReturnType<typeof changeRows>) =>
	rows.map((row) =>
		row.kind === 'dir' ? `${row.depth}:dir:${row.label}` : `${row.depth}:file:${row.label}`,
	);

test('source-control rows nest files under folders', () => {
	expect(shape(changeRows(changes('src/a.ts', 'src/b.ts', 'c.ts')))).toEqual([
		'0:file:c.ts',
		'0:dir:src',
		'1:file:a.ts',
		'1:file:b.ts',
	]);
});

test('source-control rows join single-child folder chains', () => {
	expect(shape(changeRows(changes('src/app/a.ts', 'src/app/b.ts')))).toEqual([
		'0:dir:src/app',
		'1:file:a.ts',
		'1:file:b.ts',
	]);
});

test('collapsed source-control folders keep their row and hide their files', () => {
	const rows = changeRows(changes('src/a.ts', 'src/b.ts', 'c.ts'), new Set(['src']));
	expect(shape(rows)).toEqual(['0:file:c.ts', '0:dir:src']);
	expect(rows.find((row) => row.kind === 'dir')).toMatchObject({ collapsed: true, files: 2 });
});
