#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

for tool in node npm code; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing $tool. Install Node.js 22+ and enable VS Code's 'code' command in PATH." >&2
    exit 1
  fi
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node.js 22 or newer is required."); process.exit(1); }'

if [[ ! -x node_modules/.bin/tsc ]]; then
  npm ci --no-audit --no-fund
fi
npm run compile

TEST_DIR="$PROJECT_DIR/.vscode-test/manual"
mkdir -p "$TEST_DIR/user-data" "$TEST_DIR/extensions"

echo "Opening this project with Project Bookmarks loaded from source."
echo "In the new window, open Explorer and find Bookmarks. Trust the project if prompted."
echo "Try bookmarking README.md and src/, setting an alias, and dragging entries to reorder."
echo "Bookmarks you create are saved in this project's .vscode/file-bookmarks.json."
echo "After source changes, run ./test.sh again, then reload the test window if it is already open."

# Avoid forwarding this launch to an existing editor's CLI server.
# Keep development settings and extensions separate from the normal installation.
env -u VSCODE_IPC_HOOK_CLI code \
  --new-window \
  --user-data-dir "$TEST_DIR/user-data" \
  --extensions-dir "$TEST_DIR/extensions" \
  --disable-extensions \
  --disable-extension vscode.git \
  --extensionDevelopmentPath "$PROJECT_DIR" \
  --skip-welcome \
  --skip-release-notes \
  "$PROJECT_DIR"
