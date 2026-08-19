import type { TextEncoding } from '../../core/fs';
import type { BufferState } from '../types';

export const syncedBuffer = (
	content: string,
	mtime: number,
	encoding?: TextEncoding,
): BufferState => ({ content, saved: content, dirty: false, mtime, encoding });

export const editedBuffer = (
	current: Pick<BufferState, 'saved' | 'mtime'> & Partial<BufferState>,
	content: string,
): BufferState => ({ ...current, content, dirty: content !== current.saved });
