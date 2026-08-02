import { expect, test } from 'bun:test';

import { fixture, launch, runCommand, until } from '../helpers';

test('the palette can check the appearance plugin market', async () => {
	const realFetch = globalThis.fetch;
	const requested: string[] = [];
	globalThis.fetch = ((url: string) => {
		requested.push(String(url));
		return Promise.resolve(
			new Response(
				JSON.stringify({
					plugins: [
						{ id: 'mono', version: '1.0.0' },
						{ id: 'contrast', version: '2.0.0' },
					],
				}),
			),
		);
	}) as typeof fetch;
	try {
		const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
		await runCommand(t, 'Check appearance plugin market');
		await until(t, () => t.captureCharFrame().includes('Appearance plugin market: 2 plugins'));

		expect(requested.some((url) => url.endsWith('/index.json'))).toBe(true);
	} finally {
		globalThis.fetch = realFetch;
	}
});
