#!/bin/sh
set -eu

# The home volume survives image rebuilds, so register the bundled browser
# server at startup instead of baking configuration into an ephemeral layer.
# An existing entry belongs to the user and is left alone. Failures are only
# warnings: a broken optional tool must not prevent the control room starting.
PW_ARGS="playwright-mcp --headless --browser chromium --executable-path /usr/bin/chromium --caps vision,pdf,devtools --output-dir /tmp/kasan-browser-artifacts"

if ! claude mcp get playwright >/dev/null 2>&1; then
  # shellcheck disable=SC2086
  if ! claude mcp add --scope user playwright -- $PW_ARGS >/dev/null 2>&1; then
    echo "kasan: warning: could not register Playwright MCP for Claude" >&2
  fi
fi

if ! codex mcp get playwright >/dev/null 2>&1; then
  # shellcheck disable=SC2086
  if ! codex mcp add playwright -- $PW_ARGS >/dev/null 2>&1; then
    echo "kasan: warning: could not register Playwright MCP for Codex" >&2
  fi
fi

exec "$@"
