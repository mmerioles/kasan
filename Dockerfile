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

# git and ripgrep are what the agent reaches for constantly; the rest keeps
# ordinary shell work from failing in surprising ways.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ripgrep ca-certificates curl less openssh-client procps \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force

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
COPY --from=web /app/web/dist ./web/dist

# Run as a normal user so files the agent writes into your mounted repos keep
# sane ownership. `node` is uid 1000, which matches most Linux homelab logins.
RUN mkdir -p /app/data /home/node/.claude && chown -R node:node /app /home/node
USER node

ENV NODE_ENV=production \
    KASAN_DATA=/app/data \
    KASAN_WORKSPACE=/workspace \
    HOME=/home/node

EXPOSE 7777
CMD ["node", "server/index.ts"]
