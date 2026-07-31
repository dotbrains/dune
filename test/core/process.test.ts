import { expect, test } from 'bun:test';

import { firstLine, notInstalled, run } from '../../src/core/process';

test('a timeout is reported as a timeout, not as a spawn failure', async () => {
	const result = await run('sleep', ['30'], { timeout: 100 });
	expect(result.timedOut).toBe(true);
	expect(result.error).toBeNull();
	expect(result.status).toBeNull();
});

test('output past the cap kills the process and reports overflow', async () => {
	const result = await run('sh', ['-c', 'yes long-enough-line-to-fill-a-buffer'], {
		timeout: 5000,
		maxOutput: 4096,
	});
	expect(result.overflow).toBe(true);
	expect(result.error).toBeNull();
});

test('a missing program is identifiable', async () => {
	const result = await run('dune-no-such-binary', [], { timeout: 1000 });
	expect(notInstalled(result)).toBe(true);
	expect(result.timedOut).toBe(false);
});

test('a clean run returns collected output', async () => {
	const result = await run('sh', ['-c', 'echo one; echo two'], { timeout: 5000 });
	expect(result.status).toBe(0);
	expect(result.error).toBeNull();
	expect(firstLine(result.stdout)).toBe('one');
});
