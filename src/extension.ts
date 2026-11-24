import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { Bookmark, label, reorder, renamePaths } from './model';
import { BookmarkStore, configUri, relativeTarget } from './store';

type RootNode = { type: 'root'; root: vscode.WorkspaceFolder };
export type BookmarkNode = { type: 'bookmark'; root: vscode.WorkspaceFolder; bookmark: Bookmark; missing: boolean; directory: boolean };
type ErrorNode = { type: 'error'; root: vscode.WorkspaceFolder; message: string };
type Node = RootNode | BookmarkNode | ErrorNode;
const mime = 'application/vnd.code.tree.projectbookmarks';

export class BookmarksProvider implements vscode.TreeDataProvider<Node>, vscode.TreeDragAndDropController<Node>, vscode.Disposable {
  readonly store = new BookmarkStore();
  readonly dropMimeTypes = [mime];
  readonly dragMimeTypes = [mime];
  private readonly change = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.change.event;
  private timer: ReturnType<typeof setTimeout> | undefined;
  refresh(): void { this.change.fire(undefined); }
  scheduleRefresh(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), 150);
  }
  dispose(): void { if (this.timer) clearTimeout(this.timer); this.change.dispose(); }
  async getChildren(node?: Node): Promise<Node[]> {
    const roots = vscode.workspace.workspaceFolders ?? [];
    if (!node && roots.length > 1) return roots.map(root => ({ type: 'root', root }));
    if (node && node.type !== 'root') return [];
    const root = node?.root ?? roots[0];
    if (!root) return [];
    try {
      const config = await this.store.read(root);
      return await Promise.all(config.bookmarks.map(async bookmark => {
        let missing = false, directory = false;
        try { directory = !!((await vscode.workspace.fs.stat(vscode.Uri.joinPath(root.uri, bookmark.path))).type & vscode.FileType.Directory); }
        catch { missing = true; }
        return { type: 'bookmark' as const, root, bookmark, missing, directory };
      }));
    } catch (error) {
      return [{ type: 'error', root, message: message(error) }];
    }
  }
  getParent(node: Node): Node | undefined {
    return node.type !== 'root' && (vscode.workspace.workspaceFolders?.length ?? 0) > 1 ? { type: 'root', root: node.root } : undefined;
  }
  getTreeItem(node: Node): vscode.TreeItem {
    if (node.type === 'root') {
      const item = new vscode.TreeItem(node.root.name, vscode.TreeItemCollapsibleState.Expanded);
      item.id = node.root.uri.toString(); item.iconPath = new vscode.ThemeIcon('root-folder'); return item;
    }
    if (node.type === 'error') {
      const item = new vscode.TreeItem('Fix bookmarks configuration');
      item.iconPath = new vscode.ThemeIcon('warning'); item.tooltip = node.message;
      item.command = { command: 'projectBookmarks.editConfig', title: 'Edit Configuration', arguments: [node] };
      return item;
    }
    const uri = vscode.Uri.joinPath(node.root.uri, node.bookmark.path);
    const item = new vscode.TreeItem(label(node.bookmark, node.root.name));
    item.id = `${node.root.uri.toString()}#${node.bookmark.id}`;
    item.resourceUri = uri;
    item.contextValue = 'bookmark';
    item.iconPath = node.missing ? new vscode.ThemeIcon('warning') : node.directory ? vscode.ThemeIcon.Folder : vscode.ThemeIcon.File;
    item.tooltip = `${label(node.bookmark, node.root.name)}\n${node.root.name}/${node.bookmark.path}${node.missing ? '\nTarget unavailable. Restore it, edit its path in configuration, or remove the bookmark.' : ''}`;
    item.accessibilityInformation = { label: `${label(node.bookmark, node.root.name)}, ${node.missing ? 'unavailable' : node.directory ? 'folder' : 'file'}, ${node.bookmark.path}` };
    item.command = { command: 'projectBookmarks.open', title: 'Open Bookmark', arguments: [node] };
    return item;
  }
  handleDrag(nodes: readonly Node[], transfer: vscode.DataTransfer): void {
    const entries = nodes.filter((n): n is BookmarkNode => n.type === 'bookmark');
    if (!entries.length || entries.some(n => n.root.uri.toString() !== entries[0].root.uri.toString())) return;
    transfer.set(mime, new vscode.DataTransferItem({ root: entries[0].root.uri.toString(), ids: entries.map(n => n.bookmark.id) }));
  }
  async handleDrop(target: Node | undefined, transfer: vscode.DataTransfer): Promise<void> {
    const data = transfer.get(mime)?.value as { root: string; ids: string[] } | undefined;
    if (!data || !Array.isArray(data.ids)) return;
    const root = vscode.workspace.workspaceFolders?.find(r => r.uri.toString() === data.root);
    if (!root || (target && target.root.uri.toString() !== data.root) || target?.type === 'error') return;
    await this.store.update(root, config => { config.bookmarks = reorder(config.bookmarks, data.ids, target?.type === 'bookmark' ? target.bookmark.id : undefined); });
    this.refresh();
  }
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
async function chooseRoot(): Promise<vscode.WorkspaceFolder | undefined> {
  const roots = vscode.workspace.workspaceFolders ?? [];
  if (!roots.length) { void vscode.window.showInformationMessage('Open a project folder to use Project Bookmarks.'); return; }
  if (roots.length === 1) return roots[0];
  return (await vscode.window.showQuickPick(roots.map(root => ({ label: root.name, description: root.uri.fsPath, root })), { placeHolder: 'Choose a project' }))?.root;
}
export async function openBookmark(node: BookmarkNode): Promise<void> {
  const uri = vscode.Uri.joinPath(node.root.uri, node.bookmark.path);
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    await vscode.commands.executeCommand('revealInExplorer', uri);
    if (!(stat.type & vscode.FileType.Directory)) await vscode.commands.executeCommand('vscode.open', uri, { preview: false, preserveFocus: false });
  } catch (error) {
    const choice = await vscode.window.showWarningMessage(`Cannot open ${node.bookmark.path}: ${message(error)}`, 'Edit Configuration');
    if (choice) await vscode.commands.executeCommand('projectBookmarks.editConfig', node);
  }
}
export function activate(context: vscode.ExtensionContext): BookmarksProvider {
  const provider = new BookmarksProvider();
  const view = vscode.window.createTreeView('projectBookmarks', { treeDataProvider: provider, dragAndDropController: provider, canSelectMany: true });
  const register = (name: string, handler: (...args: any[]) => unknown) => context.subscriptions.push(vscode.commands.registerCommand(`projectBookmarks.${name}`, async (...args) => {
    try { return await handler(...args); } catch (error) { void vscode.window.showErrorMessage(message(error)); }
  }));
  register('open', async (node?: BookmarkNode) => { if (node?.type === 'bookmark') await openBookmark(node); });
  register('add', async (input?: vscode.Uri) => {
    let uri = input instanceof vscode.Uri ? input : undefined;
    if (!uri) {
      const root = await chooseRoot(); if (!root) return;
      uri = (await vscode.window.showOpenDialog({ defaultUri: root.uri, canSelectFiles: true, canSelectFolders: true, canSelectMany: false, openLabel: 'Bookmark' }))?.[0];
    }
    if (!uri) return;
    const root = vscode.workspace.getWorkspaceFolder(uri);
    const path = root && relativeTarget(root, uri);
    if (!root || path === undefined) throw new Error('Choose a file or folder inside an opened project.');
    await vscode.workspace.fs.stat(uri);
    const existing = (await provider.store.read(root)).bookmarks.find(b => b.path === path);
    if (existing) {
      const nodes = await provider.getChildren({ type: 'root', root });
      const node = nodes.find(n => n.type === 'bookmark' && n.bookmark.id === existing.id);
      if (node) await view.reveal(node, { select: true, focus: true });
      return;
    }
    const alias = await vscode.window.showInputBox({ title: 'Bookmark alias', prompt: 'Leave blank to use the file or folder name.' });
    if (alias === undefined) return;
    await provider.store.update(root, config => {
      if (!config.bookmarks.some(b => b.path === path)) config.bookmarks.push({ id: randomUUID(), path, ...(alias.trim() ? { alias: alias.trim() } : {}) });
    });
    provider.refresh();
  });
  register('rename', async (node?: BookmarkNode) => {
    if (node?.type !== 'bookmark') return;
    const alias = await vscode.window.showInputBox({ title: 'Rename bookmark alias', value: node.bookmark.alias ?? '', prompt: 'Leave blank to use the file or folder name.' });
    if (alias === undefined) return;
    await provider.store.update(node.root, config => {
      const bookmark = config.bookmarks.find(b => b.id === node.bookmark.id);
      if (bookmark) { delete bookmark.alias; if (alias.trim()) bookmark.alias = alias.trim(); }
    }); provider.refresh();
  });
  register('remove', async (node?: BookmarkNode) => {
    if (node?.type !== 'bookmark') return;
    await provider.store.update(node.root, config => { config.bookmarks = config.bookmarks.filter(b => b.id !== node.bookmark.id); }); provider.refresh();
  });
  register('editConfig', async (node?: Node) => {
    const root = node?.root ?? await chooseRoot(); if (!root) return;
    try { await vscode.workspace.fs.stat(configUri(root)); }
    catch (error) {
      if (!(error instanceof vscode.FileSystemError) || error.code !== 'FileNotFound') throw error;
      await provider.store.update(root, () => {});
    }
    await vscode.window.showTextDocument(configUri(root));
  });
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  context.subscriptions.push(provider, view, watcher,
    watcher.onDidChange(() => provider.scheduleRefresh()), watcher.onDidCreate(() => provider.scheduleRefresh()), watcher.onDidDelete(() => provider.scheduleRefresh()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),
    vscode.workspace.onDidRenameFiles(async event => {
      try {
        for (const root of vscode.workspace.workspaceFolders ?? []) {
          const moves = event.files.map(f => ({ from: relativeTarget(root, f.oldUri), to: relativeTarget(root, f.newUri) })).filter((f): f is { from: string; to: string } => f.from !== undefined && f.to !== undefined);
          if (!moves.length) continue;
          const current = await provider.store.read(root);
          if (!moves.some(m => current.bookmarks.some(b => b.path === m.from || b.path.startsWith(m.from + '/')))) continue;
          await provider.store.update(root, config => { for (const move of moves) config.bookmarks = renamePaths(config.bookmarks, move.from, move.to); });
        }
        provider.refresh();
      } catch (error) { void vscode.window.showErrorMessage(message(error)); }
    })
  );
  return provider;
}
