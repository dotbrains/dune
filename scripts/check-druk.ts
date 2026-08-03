import { readFileSync } from 'node:fs';

interface Baseline {
	repository: string;
	main: string;
	release: string | null;
}

interface GitHubRef {
	object: { sha?: string };
}

interface GitHubRelease {
	tag_name?: string;
	html_url?: string;
}

interface Issue {
	number: number;
	html_url: string;
}

const baselinePath = process.argv[2] ?? '.github/druk-watch.json';
const token = process.env.GITHUB_TOKEN;
const targetRepository = process.env.GITHUB_REPOSITORY;
const issueTitle = 'Druk has upstream changes to review';
const label = 'upstream-druk';

function readBaseline(): Baseline {
	const raw: unknown = JSON.parse(readFileSync(baselinePath, 'utf8'));
	if (
		typeof raw !== 'object' ||
		raw === null ||
		!('repository' in raw) ||
		!('main' in raw) ||
		!('release' in raw) ||
		typeof raw.repository !== 'string' ||
		typeof raw.main !== 'string' ||
		(typeof raw.release !== 'string' && raw.release !== null)
	) {
		throw new Error(`${baselinePath} is not a Druk watch baseline`);
	}
	return {
		repository: raw.repository,
		main: raw.main,
		release: raw.release,
	};
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	if (!token) throw new Error('GITHUB_TOKEN is required');
	const response = await fetch(`https://api.github.com${path}`, {
		...init,
		headers: {
			accept: 'application/vnd.github+json',
			authorization: `Bearer ${token}`,
			'user-agent': 'dune-druk-watch',
			'x-github-api-version': '2022-11-28',
			...init.headers,
		},
	});
	if (response.status === 404 && path.endsWith('/releases/latest')) {
		return { tag_name: null } as T;
	}
	if (!response.ok) {
		throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
	}
	return (await response.json()) as T;
}

async function ensureLabel(repository: string): Promise<void> {
	try {
		await api(`/repos/${repository}/labels/${label}`);
	} catch {
		await api(`/repos/${repository}/labels`, {
			method: 'POST',
			body: JSON.stringify({
				name: label,
				color: '0e8a16',
				description: 'Tracks upstream Druk changes for feature-gap review',
			}),
		});
	}
}

function issueBody(baseline: Baseline, latestMain: string, latestRelease: string | null): string {
	const lines = [
		'Druk has moved since the last Dune feature-gap baseline.',
		'',
		`Upstream: https://github.com/${baseline.repository}`,
		`Baseline main: \`${baseline.main}\``,
		`Latest main: \`${latestMain}\``,
		`Baseline release: \`${baseline.release ?? 'none'}\``,
		`Latest release: \`${latestRelease ?? 'none'}\``,
		'',
		'Next steps:',
		'1. Run the feature-gap workflow against Druk.',
		'2. Port any real, destination-native gaps to Dune.',
		'3. Run local CI, commit, push, and wait for GitHub CI to pass.',
		`4. Update \`${baselinePath}\` to the reviewed Druk commit and release.`,
	];
	if (baseline.main !== latestMain) {
		lines.splice(
			8,
			0,
			`Commits: https://github.com/${baseline.repository}/compare/${baseline.main}...${latestMain}`,
			'',
		);
	}
	return lines.join('\n');
}

async function findOpenIssue(repository: string): Promise<Issue | null> {
	const query = new URLSearchParams({
		state: 'open',
		labels: label,
		per_page: '20',
	});
	const issues = await api<Issue[]>(`/repos/${repository}/issues?${query}`);
	return issues.find((issue) => issue.number && issue.html_url) ?? null;
}

async function main() {
	const baseline = readBaseline();
	if (!targetRepository) throw new Error('GITHUB_REPOSITORY is required');

	const [{ object }, latestRelease] = await Promise.all([
		api<GitHubRef>(`/repos/${baseline.repository}/git/ref/heads/main`),
		api<GitHubRelease>(`/repos/${baseline.repository}/releases/latest`),
	]);
	const latestMain = object.sha;
	if (!latestMain) throw new Error(`Could not read ${baseline.repository} main sha`);
	const latestTag = latestRelease.tag_name ?? null;

	if (latestMain === baseline.main && latestTag === baseline.release) {
		console.log(`Druk unchanged at ${latestMain}, release ${latestTag ?? 'none'}`);
		return;
	}

	const body = issueBody(baseline, latestMain, latestTag);
	await ensureLabel(targetRepository);
	const existing = await findOpenIssue(targetRepository);
	if (existing) {
		await api(`/repos/${targetRepository}/issues/${existing.number}`, {
			method: 'PATCH',
			body: JSON.stringify({ title: issueTitle, body }),
		});
		console.log(`Updated ${existing.html_url}`);
		return;
	}

	const issue = await api<Issue>(`/repos/${targetRepository}/issues`, {
		method: 'POST',
		body: JSON.stringify({ title: issueTitle, body, labels: [label] }),
	});
	console.log(`Created ${issue.html_url}`);
}

await main();
