import * as vscode from 'vscode';
import { Config, emptyConfig, parseConfig } from './model';

export const configUri = (root: vscode.WorkspaceFolder): vscode.Uri => vscode.Uri.joinPath(root.uri, '.vscode', 'file-bookmarks.json');
export class BookmarkStore {
  private pending: Promise<unknown> = Promise.resolve();
  async read(root: vscode.WorkspaceFolder): Promise<Config> {
    try {
      return parseConfig(Buffer.from(await vscode.workspace.fs.readFile(configUri(root))).toString('utf8'));
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') return emptyConfig();
      throw new Error(`${root.name}: cannot read .vscode/file-bookmarks.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  update(root: vscode.WorkspaceFolder, change: (config: Config) => void): Promise<void> {
    const operation = this.pending.then(async () => {
      const uri = configUri(root);
      if (vscode.workspace.textDocuments.some(d => d.uri.toString() === uri.toString() && d.isDirty)) {
        throw new Error('Save or discard changes to file-bookmarks.json before changing bookmarks.');
      }
      const config = await this.read(root);
      const before = JSON.stringify(config);
      change(config);
      const next = parseConfig(JSON.stringify(config));
      if (JSON.stringify(await this.read(root)) !== before) throw new Error('Bookmarks changed on disk. Please retry.');
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root.uri, '.vscode'));
      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(next, null, 2) + '\n'));
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}
export function relativeTarget(root: vscode.WorkspaceFolder, uri: vscode.Uri): string | undefined {
  if (uri.scheme !== root.uri.scheme || uri.authority !== root.uri.authority) return undefined;
  const base = root.uri.path.replace(/\/$/, '');
  if (uri.path === base) return '.';
  return uri.path.startsWith(base + '/') ? uri.path.slice(base.length + 1) : undefined;
}
