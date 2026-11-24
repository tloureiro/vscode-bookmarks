import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'project-bookmarks-test-'));
  try {
    const roots = [path.join(temp, 'first'), path.join(temp, 'second')];
    for (const root of roots) {
      await fs.mkdir(path.join(root, 'docs'), { recursive: true });
      await fs.writeFile(path.join(root, 'hello.txt'), 'Hello bookmarks\n');
    }
    const workspace = path.join(temp, 'test.code-workspace');
    await fs.writeFile(workspace, JSON.stringify({ folders: roots.map(path => ({ path })) }));
    // Codex and Electron-based terminals may inherit Node-only mode.
    delete process.env.ELECTRON_RUN_AS_NODE;
    await runTests({
      extensionDevelopmentPath: path.resolve(__dirname, '../..'),
      extensionTestsPath: path.resolve(__dirname, 'integration.js'),
      ...(process.env.VSCODE_EXECUTABLE_PATH ? { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH } : {}),
      launchArgs: [workspace, '--user-data-dir=' + path.join(temp, 'profile'), '--extensions-dir=' + path.join(temp, 'extensions'), '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-updates']
    });
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
