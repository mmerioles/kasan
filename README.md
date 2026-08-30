# kasan

<p align="center">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1b1b19?style=flat-square" /></a>
  <img alt="Node 24+" src="https://img.shields.io/badge/Node-24%2B-1b1b19?style=flat-square&logo=nodedotjs&logoColor=white" />
  <img alt="Claude Code and Codex" src="https://img.shields.io/badge/agents-Claude%20%2B%20Codex-1b1b19?style=flat-square" />
</p>

<p align="center"><strong>A quiet control room for coding agents.</strong></p>

Run Claude Code or Codex on your own machine. Send it work from your phone,
close the page, and come back when it is done.

<p align="center">
  <img src="docs/kasan-doodle.svg" width="500" alt="A hand-drawn phone sending a task through kasan to two coding agents and a repository" />
</p>

## Quick start

```bash
git clone https://github.com/mmerioles/kasan.git
cd kasan
cp .env.example .env      # set KASAN_PASSCODE and HOST_WORKSPACE
docker compose up -d --build
```

Open [http://localhost:7777](http://localhost:7777). From a phone, install
Tailscale on both devices and open `http://<machine-name>:7777`.

## Sign in

The container has no browser, so mint a token where you do have one:

```bash
claude setup-token        # on your laptop
```

The browser shows a **code** (`abc...#def...`) — paste it back into the terminal
that is still waiting. It then prints the **token** (`sk-ant-oat01-...`), and the
token is what goes in `.env`. Two different strings; the code is single-use.

```bash
# .env
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
```

`ANTHROPIC_API_KEY` and `OPENAI_API_KEY` work the same way. For Codex, run
`docker compose exec kasan codex login --device-auth` — the plain form waits on a
callback inside the container that no browser can reach.

Verify with a real call. `auth status` only checks that a credential parses, and
happily reports `loggedIn: true` for one the server rejects:

```bash
docker compose exec kasan claude -p "say OK"
```

## What you get

- Sessions that keep running with the browser closed, and resume after idle or a restart
- Live replies, tool calls, and errors as they happen
- A permission level per session: **just go**, **edits only**, **read only**
- A real browser for the agent, plus arrow, box, and freehand feedback on live previews
- Selectable SVG and image galleries from the bundled asset-designer skill

| | Claude Code | Codex |
| --- | --- | --- |
| Run, resume, stream | ✅ | ✅ |
| Browser and MCP servers | ✅ | ✅ |
| Models you can pick | Opus 5, Sonnet 5, Fable 5, Haiku 4.5 | GPT-5.6 Sol / Terra / Luna, 5.5, 5.4, 5.4 Mini |

## MCP servers

**Playwright** is preconfigured for both agents: DOM and accessibility snapshots,
clicking and typing, console and network inspection, screenshots, PDF.

Add your own — they live in the persistent home volume and survive rebuilds:

```bash
docker compose exec kasan claude mcp add --scope user <name> -- <command>
docker compose exec kasan codex mcp add <name> -- <command>
```

Also in the container: git, ripgrep, Chromium, Playwright, Python, build tools,
curl, jq, SQLite, ShellCheck, svgo, librsvg, ImageMagick, and `kasan-preview`
for long-running dev servers.

## NixOS

A flake package and NixOS module run kasan as a native systemd service in a
dedicated VM. There is no Docker boundary, so agents see the whole VM. See the
[NixOS deployment guide](docs/nixos.md).

## Notes

- Mount only repositories you trust an agent with, and keep kasan on a private network.
- Configuration lives in `.env`. Run `docker compose logs -f` when something looks wrong.
- Sessions and credentials survive normal rebuilds and restarts.
- Development: `npm install`, then `KASAN_PASSCODE=dev KASAN_WORKSPACE=$HOME/repos npm run dev`.

MIT licensed. See [LICENSE](LICENSE).
