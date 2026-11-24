import * as path from 'node:path';

export interface Bookmark { id: string; path: string; alias?: string }
export interface Config { version: 1; bookmarks: Bookmark[] }
export const emptyConfig = (): Config => ({ version: 1, bookmarks: [] });

export function normalizePath(value: string): string {
  if (!value || value.includes('\\') || value.includes('\0') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
    throw new Error('Bookmark paths must be relative, using forward slashes.');
  }
  const normalized = path.posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../')) throw new Error('Bookmark paths must stay inside the project.');
  return normalized.replace(/\/$/, '') || '.';
}
export function parseConfig(text: string): Config {
  const value = JSON.parse(text);
  if (!value || value.version !== 1 || !Array.isArray(value.bookmarks) || Object.keys(value).some(k => !['version', 'bookmarks'].includes(k))) {
    throw new Error('Expected version 1 and a bookmarks array.');
  }
  const ids = new Set<string>();
  const paths = new Set<string>();
  const bookmarks = value.bookmarks.map((entry: unknown): Bookmark => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid bookmark entry.');
    const b = entry as Record<string, unknown>;
    if (typeof b.id !== 'string' || !b.id.trim() || typeof b.path !== 'string' ||
        (b.alias !== undefined && typeof b.alias !== 'string') || Object.keys(b).some(k => !['id', 'path', 'alias'].includes(k))) {
      throw new Error('Each bookmark needs a unique id, a relative path, and an optional string alias.');
    }
    const target = normalizePath(b.path);
    if (ids.has(b.id) || paths.has(target)) throw new Error('Duplicate bookmark id or target.');
    ids.add(b.id); paths.add(target);
    return { id: b.id, path: target, ...(typeof b.alias === 'string' && b.alias.trim() ? { alias: b.alias.trim() } : {}) };
  });
  return { version: 1, bookmarks };
}
export function label(bookmark: Bookmark, rootName: string): string {
  return bookmark.alias?.trim() || (bookmark.path === '.' ? rootName : path.posix.basename(bookmark.path));
}
export function reorder(bookmarks: Bookmark[], ids: string[], beforeId?: string): Bookmark[] {
  const selected = new Set(ids);
  if (beforeId && selected.has(beforeId)) return bookmarks;
  const moving = bookmarks.filter(b => selected.has(b.id));
  const rest = bookmarks.filter(b => !selected.has(b.id));
  const index = beforeId ? rest.findIndex(b => b.id === beforeId) : rest.length;
  rest.splice(index < 0 ? rest.length : index, 0, ...moving);
  return rest;
}
export function renamePaths(bookmarks: Bookmark[], from: string, to: string): Bookmark[] {
  return bookmarks.map(b => b.path === from || from === '.' || b.path.startsWith(from + '/')
    ? { ...b, path: normalizePath(to + (b.path === from ? '' : '/' + (from === '.' ? b.path : b.path.slice(from.length + 1)))) }
    : b);
}
