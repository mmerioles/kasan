# kasan

<p align="center">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1b1b19?style=flat-square" /></a>
  <img alt="Docker" src="https://img.shields.io/badge/runs%20with-Docker-1b1b19?style=flat-square&logo=docker&logoColor=white" />
  <img alt="Node 24+" src="https://img.shields.io/badge/Node-24%2B-1b1b19?style=flat-square&logo=nodedotjs&logoColor=white" />
  <img alt="Claude Code and Codex" src="https://img.shields.io/badge/agents-Claude%20%2B%20Codex-1b1b19?style=flat-square" />
</p>

<p align="center"><strong>A quiet control room for coding agents.</strong></p>

Run Claude Code or Codex on your own machine. Send it work from your phone,
close the page, and come back when it is done.

<p align="center">
  <img src="docs/kasan-doodle.svg" width="500" alt="A hand-drawn phone sending a task through kasan to two coding agents and a repository" />
</p>

## What it does

- Runs agents inside your repositories
- Keeps sessions alive without an open browser
- Streams replies, tool calls, errors, and status
- Resumes after idle time or a restart
- Gives agents Chromium tools for testing UIs
- Works well from a phone over Tailscale

## Support

| | Claude Code | Codex |
| --- | :---: | :---: |
| Run and resume | ✅ | ✅ |
| Tool activity | ✅ | ✅ |
| Permission levels | ✅ | ✅ |
| Playwright browser | ✅ | ✅ |
| Custom MCP servers | ✅ | ✅ |
| Model picker | — | ✅ |

Included tools: Git, ripgrep, Chromium, Playwright, Python, build tools, curl,
jq, SQLite, ShellCheck, lsof, and `kasan-preview` for long-running dev servers.

## Start

```bash
git clone https://github.com/mmerioles/kasan.git
cd kasan
cp .env.example .env
$EDITOR .env
docker compose up -d --build
```

Set `KASAN_PASSCODE` and `HOST_WORKSPACE` in `.env`, then sign in to the agent
you want:

```bash
docker compose exec kasan claude setup-token
docker compose exec kasan codex login --device-auth
```

Open [http://localhost:7777](http://localhost:7777).

For phone access, install Tailscale on both devices and open:

```text
http://<machine-name>:7777
```

Choose **just go**, **edits only**, or **read only** for each session. Mount only
repositories you trust an agent to access, and keep kasan on a private network.

Configuration lives in `.env`. Run `docker compose logs -f` when something
looks wrong. Sessions and credentials survive normal rebuilds and restarts.

Development is `npm install`, then
`KASAN_PASSCODE=dev KASAN_WORKSPACE=$HOME/repos npm run dev`.

MIT licensed. See [LICENSE](LICENSE).
