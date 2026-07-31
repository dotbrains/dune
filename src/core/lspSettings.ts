export type LspServerEdit =
	| { ok: true; id: string; command: string[] | null }
	| { ok: false; error: string };

export function parseLspServerEdit(input: string): LspServerEdit {
	const at = input.indexOf('=');
	if (at < 0) return { ok: false, error: 'LSP override syntax: server = command' };
	const id = input.slice(0, at).trim();
	if (!id) return { ok: false, error: 'LSP override needs a server id' };
	const command = input
		.slice(at + 1)
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (command.length === 0) return { ok: true, id, command: null };
	if (command.length === 1 && command[0]!.toLowerCase() === 'none')
		return { ok: true, id, command: [] };
	return { ok: true, id, command };
}
