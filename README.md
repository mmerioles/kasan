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

Open [http://localhost:7777](http://localhost:7777) and enter your passcode.
From a phone, install Tailscale on both devices and open
`http://<machine-name>:7777`.

`HOST_WORKSPACE` is the folder of repositories you want to work on. It is
mounted at `/workspace`, and `KASAN_WORKSPACE` decides which paths in there a
session may open — one directory, or several separated by commas.

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

- **Sessions that outlive the page.** A turn keeps running once you close the
  browser. Conversations are kept on disk and resume on your next message —
  after an idle stop (60 minutes by default) or a restart.
- **A live transcript.** Replies, tool calls, and errors as they happen.
- **A trust level per session.** *just go* runs unattended; *edits only* lets the
  agent change files here but not run commands freely; *read only* looks and
  plans, changing nothing.
- **Feedback on what you see.** Screenshot a running preview or paste in a
  photo, mark it up with arrows, boxes, and pen, and send the marked image back.
- **Asset galleries.** The bundled asset-designer skill offers batches of SVG or
  image options: pick one to continue, open one larger to mark up, or copy one
  to your clipboard.

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
curl, jq, SQLite, ShellCheck, svgo, librsvg, ImageMagick, and ffmpeg. Plus
`kasan-preview`, which keeps a dev server up between turns — start one that way
and the capture button finds it without your typing a URL.

## NixOS

A flake package and NixOS module run kasan as a native systemd service in a
dedicated VM. There is no Docker boundary, so agents see the whole VM. See the
[NixOS deployment guide](docs/nixos.md).

## Notes

- Mount only repositories you trust an agent with, and keep kasan on a private network.
- Kasan accepts only one prompt at a time per session. By default it also stops
  a turn after 30 minutes or 100 tool calls. Tune these with
  `KASAN_MAX_TURN_MINUTES` and `KASAN_MAX_TOOLS_PER_TURN`; use `0` only to
  disable a guard intentionally.
- Configuration lives in `.env`. Run `docker compose logs -f` when something looks wrong.
- Sessions and credentials survive normal rebuilds and restarts.
- Development: `npm install`, then `KASAN_PASSCODE=dev KASAN_WORKSPACE=$HOME/repos npm run dev`.
  The UI is on [7778](http://localhost:7778) and proxies the API on 7777.

MIT licensed. See [LICENSE](LICENSE).
