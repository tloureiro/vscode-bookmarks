# Project Bookmarks

Quick access to individual files and folders in your project's Explorer sidebar.

## Install

Requires Node.js 22 or newer, npm, and the `code` command in PATH (in VS Code, run **Shell Command: Install 'code' command in PATH**).

```sh
./install.sh
```

The script installs locked development dependencies, builds a VSIX, and installs it in VS Code. Run it again after changing the extension to update your installation. Reload your VS Code window if prompted. No Marketplace account is needed.

## Use

- Open a project and find **Bookmarks** in Explorer. Drag its header to position it near Outline or Timeline, and resize it using the divider.
- Right-click a file or folder → **Add Bookmark**, or use the Bookmarks header's **+** button. Enter an alias, or leave it blank to use the target's name.
- Click a bookmark to reveal its target in Explorer. Files also open in a persistent editor tab; folders are selected without changing the workspace.
- Hover for the full relative path. Use the entry's pencil to change its alias and the × to remove it.
- Drag entries onto another entry to place them before it, or into the list's empty area to move them to the end. Ordering stays within each project root.
- Use **Project Bookmarks: Edit Bookmarks Configuration** to edit paths directly or repair missing targets.

Rows use your file icon theme, native keyboard navigation, and tooltips so short aliases work well in narrow sidebars. VS Code controls the view's exact placement and size; the extension cannot pin buttons inside Explorer's file tree.

## Project configuration

Bookmarks are saved in `.vscode/file-bookmarks.json` in each workspace root. You can commit this file to share bookmarks. Paths remain portable when the project moves.

```json
{
  "version": 1,
  "bookmarks": [
    { "id": "app", "path": "src/app.ts", "alias": "App" },
    { "id": "docs", "path": "docs" }
  ]
}
```

IDs and target paths must be unique within a root. Paths use forward slashes and stay within that root; `.` bookmarks the root itself. The array defines display order. Blank aliases use the file/folder name. Strict JSON validation and completion are included.

Each root gets a group in a multi-root workspace. Renames made through VS Code within a root update bookmarks, including children of renamed folders. Moves between roots and external filesystem renames need a path edit. Deleted or inaccessible targets remain visible with a warning. Configuration changes on disk are picked up automatically. Invalid or unsaved configuration blocks changes until fixed or saved.

## Development

To try the extension interactively in this project without installing it:

```sh
./test.sh
```

This compiles the source (installing development dependencies if needed) and opens a separate VS Code window with the extension loaded from this directory. Its settings and installed-extension directory are isolated under `.vscode-test/manual/`; other installed extensions are disabled. Trust the project if prompted, then open Explorer → **Bookmarks**.

Try adding `README.md` and `src/`, giving one an alias, clicking both, and dragging them to reorder. Bookmarks are saved in this project's `.vscode/file-bookmarks.json`, so you can also close and reopen the test window to check persistence. After changing source code, rerun `./test.sh` and reload the test window if it is already open.

For automated checks and packaging:

```sh
npm ci
npm test
npm run test:integration
npm run package
```

Press F5 to launch an Extension Development Host. Integration tests launch an isolated VS Code profile with two temporary project folders; by default the runner downloads a test copy of VS Code. To use an installed copy instead:

```sh
VSCODE_EXECUTABLE_PATH='/Applications/Visual Studio Code.app/Contents/MacOS/Code' npm run test:integration
```

Packaging uses the project-local VSCE tool. Only compiled runtime code, schema, icon, and documentation are needed in the VSIX. Desktop VS Code 1.96+ is supported. This extension does not publish to the Marketplace or run Git commands.
