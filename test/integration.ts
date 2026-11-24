import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { BookmarksProvider, BookmarkNode } from '../src/extension';
import { BookmarkStore, configUri } from '../src/store';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<BookmarksProvider>('tloureiro.project-file-bookmarks');
  assert.ok(extension);
  const provider = await extension.activate();
  const [first, second] = vscode.workspace.workspaceFolders!;
  assert.ok(first && second);
  const roots = await provider.getChildren();
  assert.equal(roots.length, 2);
  await provider.store.update(first, config => { config.bookmarks = [{ id: 'file', path: 'hello.txt', alias: 'Hello' }, { id: 'folder', path: 'docs' }]; });
  assert.equal((await new BookmarkStore().read(first)).bookmarks.length, 2, 'persists between store instances');
  assert.equal((await provider.store.read(second)).bookmarks.length, 0, 'roots remain isolated');
  const nodes = await provider.getChildren(roots[0]);
  const file = nodes[0] as BookmarkNode, folder = nodes[1] as BookmarkNode;
  assert.equal(file.missing, false); assert.equal(folder.directory, true);
  assert.equal(provider.getTreeItem(file).label, 'Hello');
  await vscode.commands.executeCommand('projectBookmarks.add', vscode.Uri.joinPath(first.uri, 'hello.txt'));
  assert.equal((await provider.store.read(first)).bookmarks.length, 2, 'duplicate add does not prompt or duplicate');
  await vscode.commands.executeCommand('projectBookmarks.open', file);
  assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), vscode.Uri.joinPath(first.uri, 'hello.txt').toString());
  await vscode.commands.executeCommand('projectBookmarks.open', folder);
  assert.equal(vscode.workspace.workspaceFolders!.length, 2, 'folder navigation preserves workspace');
  const transfer = new vscode.DataTransfer();
  provider.handleDrag([folder], transfer); await provider.handleDrop(file, transfer);
  assert.equal((await provider.store.read(first)).bookmarks[0].id, 'folder');
  const renamed = new vscode.WorkspaceEdit();
  renamed.renameFile(vscode.Uri.joinPath(first.uri, 'docs'), vscode.Uri.joinPath(first.uri, 'guides'));
  await vscode.workspace.applyEdit(renamed);
  await eventually(async () => (await provider.store.read(first)).bookmarks[0].path === 'guides', 'rename persists the new folder path');
  const refreshed = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { listener.dispose(); reject(new Error('Configuration watcher did not refresh the tree.')); }, 5000);
    const listener = provider.onDidChangeTreeData(async () => {
      const children = await provider.getChildren(roots[0]);
      if (children[0]?.type === 'bookmark' && children[0].bookmark.id === 'external') {
        clearTimeout(timeout); listener.dispose(); resolve();
      }
    });
  });
  await vscode.workspace.fs.writeFile(configUri(first), Buffer.from(JSON.stringify({ version: 1, bookmarks: [{ id: 'external', path: 'missing.txt' }] })));
  await refreshed;
  const external = await provider.getChildren(roots[0]);
  assert.equal((external[0] as BookmarkNode).bookmark.id, 'external');
  assert.equal((external[0] as BookmarkNode).missing, true);
  await vscode.workspace.fs.writeFile(configUri(first), Buffer.from('{ broken'));
  await assert.rejects(provider.store.update(first, config => { config.bookmarks = []; }));
  assert.equal(Buffer.from(await vscode.workspace.fs.readFile(configUri(first))).toString(), '{ broken');
  assert.equal((await provider.getChildren(roots[0]))[0].type, 'error');
  await vscode.workspace.fs.writeFile(configUri(first), Buffer.from('{"version":1,"bookmarks":[]}'));
  const document = await vscode.workspace.openTextDocument(configUri(first));
  const edits = new vscode.WorkspaceEdit(); edits.insert(document.uri, new vscode.Position(0, 0), ' ');
  await vscode.workspace.applyEdit(edits);
  await assert.rejects(provider.store.update(first, () => {}), /Save or discard/);
  await document.save();
  console.log('Integration checks passed: persistence, isolation, navigation, duplicates, reordering, renames, configuration watcher, missing targets, invalid config, dirty config.');
}

async function eventually(check: () => Promise<boolean>, description: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail(description);
}
