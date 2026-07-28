import { CLASH_CHANGED, CLASH_DELETED } from './constants';
import type { DiskSync } from './types';

export function clashWarning(sync: DiskSync): string | null {
	const parts: string[] = [];
	if (sync.changed.length > 0) parts.push(`${CLASH_CHANGED}${sync.changed.join(', ')}`);
	if (sync.deleted.length > 0) parts.push(`${CLASH_DELETED}${sync.deleted.join(', ')}`);
	return parts.length > 0 ? parts.join(' · ') : null;
}
