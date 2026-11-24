import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { label, normalizePath, parseConfig, renamePaths, reorder } from '../src/model';
const a = { id: 'a', path: 'src/one.ts' }, b = { id: 'b', path: 'docs' }, c = { id: 'c', path: 'index.ts' };
test('config round-trips portable relative paths and trims aliases', () => {
  const config = parseConfig(JSON.stringify({ version: 1, bookmarks: [{ ...a, path: 'src/./one.ts', alias: ' Main ' }, { ...b, alias: '  ' }] }));
  assert.deepEqual(config.bookmarks, [{ ...a, alias: 'Main' }, b]);
  assert.equal(label(config.bookmarks[0], 'project'), 'Main');
  assert.equal(label(b, 'project'), 'docs');
  assert.equal(label({ id: 'root', path: '.' }, 'project'), 'project');
});
test('invalid and escaping paths, versions, duplicate ids and targets are rejected', () => {
  for (const path of ['../secret', 'src/../../secret', '/tmp/file', 'C:/file', 'a\\b', '']) assert.throws(() => normalizePath(path));
  for (const value of [{}, { version: 2, bookmarks: [] }, { version: 1, bookmarks: [a, a] }, { version: 1, bookmarks: [a, { ...a, id: 'other' }] }, { version: 1, bookmarks: [{ ...a, alias: 42 }] }]) assert.throws(() => parseConfig(JSON.stringify(value)));
  assert.throws(() => parseConfig('{ broken'));
});
test('reorder preserves selected order and supports end and self drops', () => {
  assert.deepEqual(reorder([a, b, c], ['c'], 'a'), [c, a, b]);
  assert.deepEqual(reorder([a, b, c], ['a']), [b, c, a]);
  assert.deepEqual(reorder([a, b, c], ['b', 'a']), [c, a, b]);
  assert.deepEqual(reorder([a, b, c], ['a'], 'a'), [a, b, c]);
});
test('rename updates descendants without changing aliases or sibling prefixes', () => {
  const bookmarks = [{ ...a, alias: 'Main' }, b, { id: 'd', path: 'src-other/one.ts' }];
  assert.deepEqual(renamePaths(bookmarks, 'src', 'lib'), [{ ...a, path: 'lib/one.ts', alias: 'Main' }, b, bookmarks[2]]);
  assert.equal(renamePaths([a], a.path, 'two.ts')[0].path, 'two.ts');
});
