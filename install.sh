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
npm ci --no-audit --no-fund
npm run package
code --install-extension "$PROJECT_DIR/project-file-bookmarks.vsix" --force
echo "Project Bookmarks installed. Reload the VS Code window if prompted."
