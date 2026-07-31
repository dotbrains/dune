import { expect, test } from 'bun:test';
import { join } from 'node:path';

import { pathTokenAt, resolvePathToken } from '../../src/core/pathTarget';
import { fixture } from '../helpers';

test('pathTokenAt finds quoted and bare paths at the cursor', () => {
	expect(pathTokenAt("import thing from './thing';", 20)).toBe('./thing');
	expect(pathTokenAt('see docs/intro.md for details', 6)).toBe('docs/intro.md');
	expect(pathTokenAt('no path here', 2)).toBe('no');
	expect(pathTokenAt('', 0)).toBe(null);
});

test('resolvePathToken handles relative, root, index, and tsconfig alias paths', () => {
	const dir = fixture({
		'src/app.ts': '',
		'src/feature/target.ts': '',
		'src/feature/index.ts': '',
		'docs/intro.md': '',
		'tsconfig.json': `{
			// JSONC is accepted because editors commonly leave comments here.
			"compilerOptions": {
				"baseUrl": ".",
				"paths": {
					"@/*": ["src/*"],
				},
			},
		}`,
	});
	const fromDir = join(dir, 'src');

	expect(resolvePathToken('./feature/target', fromDir, dir)).toBe(
		join(dir, 'src/feature/target.ts'),
	);
	expect(resolvePathToken('docs/intro.md', fromDir, dir)).toBe(join(dir, 'docs/intro.md'));
	expect(resolvePathToken('./feature', fromDir, dir)).toBe(join(dir, 'src/feature/index.ts'));
	expect(resolvePathToken('@/feature/target', fromDir, dir)).toBe(
		join(dir, 'src/feature/target.ts'),
	);
	expect(resolvePathToken('react', fromDir, dir)).toBe(null);
});
