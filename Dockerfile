# ---- build the web UI -------------------------------------------------
FROM node:24-bookworm-slim AS web
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY web ./web
RUN npm run build

# ---- runtime ----------------------------------------------------------
FROM node:24-bookworm-slim

# The agent is expected to build, inspect, and test unfamiliar repositories.
# Keep the base toolbelt deliberately boring and broadly useful. Chromium is
# used both by Playwright MCP and by project-owned Playwright test suites.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ripgrep ca-certificates curl wget less openssh-client procps \
      chromium build-essential python3 python3-pip python3-venv \
      jq unzip zip sqlite3 shellcheck netcat-openbsd lsof \
      librsvg2-bin imagemagick pngquant optipng webp gifsicle ffmpeg \
      fonts-noto-core fonts-noto-color-emoji fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

# Playwright MCP gives both agents a semantic browser (DOM/accessibility
# snapshots, console/network inspection, screenshots and PDF support). The
# regular Playwright CLI remains available for repositories without their own
# local installation.
RUN npm install -g \
      @anthropic-ai/claude-code \
      @openai/codex \
      @playwright/mcp@0.0.79 \
      playwright@1.62.1 \
      svgo@4.0.0 \
  && npm cache clean --force

# Files the agent writes land in your mounted repos, so the container user must
# match the host user that owns them. uid 1000 covers most single-user Linux
# boxes; override with KASAN_UID/KASAN_GID in .env if `id -u` says otherwise.
ARG KASAN_UID=1000
ARG KASAN_GID=1000
RUN if [ "$KASAN_GID" != "1000" ]; then groupmod -g "$KASAN_GID" node; fi \
 && if [ "$KASAN_UID" != "1000" ]; then usermod -u "$KASAN_UID" -g "$KASAN_GID" node; fi

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server ./server
COPY scripts ./scripts
COPY skills ./skills
COPY --from=web /app/web/dist ./web/dist

RUN chmod +x /app/scripts/kasan-entrypoint.sh /app/scripts/kasan-preview.mjs \
 && ln -s /app/scripts/kasan-preview.mjs /usr/local/bin/kasan-preview

# Run as a normal user so files the agent writes into your mounted repos keep
# sane ownership. `node` is uid 1000, which matches most Linux homelab logins.
RUN mkdir -p /app/data /home/node/.claude && chown -R node:node /app /home/node
USER node

ENV NODE_ENV=production \
    KASAN_DATA=/app/data \
    KASAN_WORKSPACE=/workspace \
    HOME=/home/node

EXPOSE 7777
ENTRYPOINT ["/app/scripts/kasan-entrypoint.sh"]
CMD ["node", "server/index.ts"]
