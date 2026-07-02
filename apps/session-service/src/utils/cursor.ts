/**
 * utils/cursor.ts
 *
 * Opaque cursor encoding/decoding for keyset pagination.
 * Cursor is base64(JSON({ id, created_at })) — opaque to the client.
 * See CONVENTIONS.md §3: cursor-based pagination.
 */

import { CursorPayload } from '../types';

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof decoded.id !== 'string' || typeof decoded.created_at !== 'string') {
      return null;
    }
    return decoded as CursorPayload;
  } catch {
    return null;
  }
}
