#!/bin/zsh
set -eu
SCRIPT_DIR="${0:A:h}"
if [[ -n "${NIANNIAN_NODE:-}" && -x "$NIANNIAN_NODE" ]]; then
  NODE_BIN="$NIANNIAN_NODE"
elif command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif [[ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]]; then
  NODE_BIN="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  print -u2 '需要 Node.js 20 或更新版本；安装后重新连接 MCP。'
  exit 1
fi
exec "$NODE_BIN" "$SCRIPT_DIR/server.mjs" "$@"
