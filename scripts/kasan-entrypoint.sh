#!/bin/sh
set -eu

# The home volume survives image rebuilds, so register the bundled browser
# server at startup instead of baking configuration into an ephemeral layer.
# An existing entry belongs to the user and is left alone. Failures are only
# warnings: a broken optional tool must not prevent the control room starting.
KASAN_APP_DIR=${KASAN_APP_DIR:-/app}
KASAN_CHROMIUM_BIN=${KASAN_CHROMIUM_BIN:-/usr/bin/chromium}
PW_ARGS="playwright-mcp --headless --browser chromium --executable-path $KASAN_CHROMIUM_BIN --caps vision,pdf,devtools --output-dir /tmp/kasan-browser-artifacts"

# Product-owned skills live in /app so image rebuilds can update them even
# though the agent home is a persistent volume. Existing user entries win.
for SKILL_HOME in "$HOME/.codex/skills" "$HOME/.claude/skills"; do
  mkdir -p "$SKILL_HOME"
  if [ ! -e "$SKILL_HOME/asset-designer" ] && [ ! -L "$SKILL_HOME/asset-designer" ]; then
    ln -s "$KASAN_APP_DIR/skills/asset-designer" "$SKILL_HOME/asset-designer"
  fi
done

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
