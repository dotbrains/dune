import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = 'test';
const BATCH_SIZE = Number.parseInt(process.env.DUNE_TEST_BATCH_SIZE ?? '1', 10);

const names = readdirSync(TEST_DIR).filter((name) => /\.test\.tsx?$/.test(name));
const coveredByTs = new Set(
	names
		.filter((name) => name.endsWith('.test.ts'))
		.map((name) => name.replace(/\.test\.ts$/, '.test.tsx')),
);
const tests = names
	.filter((name) => !coveredByTs.has(name))
	.toSorted()
	.map((name) => join(TEST_DIR, name));

if (tests.length === 0) {
	console.error('No test files found');
	process.exit(1);
}

for (let at = 0; at < tests.length; at += BATCH_SIZE) {
	const batch = tests.slice(at, at + BATCH_SIZE);
	console.log(`\n# bun test ${at + 1}-${at + batch.length} of ${tests.length}`);
	const run = Bun.spawnSync(['bun', 'test', '--timeout=30000', ...batch], {
		stdout: 'inherit',
		stderr: 'inherit',
	});
	if (run.exitCode !== 0) process.exit(run.exitCode ?? 1);
}
