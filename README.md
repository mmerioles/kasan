# kasan

A quiet control room for coding agents.

kasan runs **Claude Code** and **Codex** on a machine you own and puts a very
small web page in front of it. Open that page from your phone, a laptop, or any
other computer on your Tailscale network, tell it what you want done, and walk
away. The agent keeps working whether or not anything is watching.

```
      phone / laptop / work pc
                 │
                 │  tailnet
                 ▼
   ┌─────────────────────────────┐
   │  kasan                      │
   │     ├── spawn ──► claude    │
   │     ├── spawn ──► codex     │
   │     └── sqlite (transcripts)│
   └─────────────────────────────┘
                 │
                 ▼
             your repos
```

---

## Get it running

You need **Docker** and about two minutes.

```bash
git clone <this-repo> kasan && cd kasan

cp .env.example .env
$EDITOR .env          # set KASAN_PASSCODE, point HOST_WORKSPACE at your repos

docker compose up -d --build
```

Then sign in whichever agents you want to use — **once**, ever:

```bash
docker compose exec kasan claude setup-token            # Claude Code
docker compose exec kasan codex login --device-auth     # Codex
```

Each prints a URL. Open it, sign in, and paste the code back into the terminal.
The credentials land in a Docker volume, so they survive restarts, rebuilds, and
`docker compose down`.

> **Codex needs `--device-auth`.** Plain `codex login` starts an OAuth callback
> server bound to `127.0.0.1:1455` *inside the container*, which your browser
> cannot reach — and publishing the port does not help, because it only listens
> on loopback. Device auth has no callback server, so it works from a container
> and over SSH. Codex says as much itself if you run the plain form.

You only need the one you plan to use — kasan will tell you, in the session
itself, if you pick an agent that is not signed in yet.

Open **http://localhost:7777**, enter your passcode, and start a session.

> Prefer API keys? Put `ANTHROPIC_API_KEY=sk-ant-...` in `.env` for Claude, or
> run `docker compose exec -T kasan codex login --with-api-key <<< "$OPENAI_API_KEY"`
> for Codex. Neither needs a browser.

---

## Reaching it from your phone

Install Tailscale on the homelab and on your phone, then visit:

```
http://<machine-name>:7777
```

`<machine-name>` is whatever `tailscale status` calls the box. That is the whole
setup — kasan listens on all interfaces, and Tailscale handles the rest.

For a real certificate and a name that does not need a port, ask Tailscale to
put it on HTTPS:

```bash
sudo tailscale serve --bg 7777
```

Now it is at `https://<machine-name>.<your-tailnet>.ts.net`, which also lets you
add it to your phone's home screen as a proper standalone app.

---

## Picking an agent

Every session runs one agent, chosen when you create it under **who**. You can
swap a session between them from the buttons in its header.

Switching **starts a fresh conversation**. Claude Code and Codex each keep their
own history in their own on-disk format, and neither can pick the other's up —
so the transcript you are looking at stays on screen, but the agent you switched
to has not read any of it. kasan says as much in the transcript when you switch.

Run two sessions in the same folder instead if you want both agents working with
their own context.

---

## Settings

Everything lives in `.env`:

| Variable             | Default      | What it does                                                  |
| -------------------- | ------------ | ------------------------------------------------------------- |
| `KASAN_PASSCODE`     | *(required)* | The passcode you type on your phone. **Change it.**            |
| `HOST_WORKSPACE`     | `~/repos`    | Host folder holding the repos the agent may touch.             |
| `KASAN_PORT`         | `7777`       | Port on the host.                                              |
| `KASAN_IDLE_MINUTES` | `60`         | Park an idle agent after this long. `0` never parks.           |
| `KASAN_UID` / `_GID` | `1000`       | Only if your login is not uid 1000 — see *Wrong file owner*.   |
| `ANTHROPIC_API_KEY`  | *(empty)*    | Alternative to `claude setup-token`.                           |

After changing `.env`: `docker compose up -d` (add `--build` for the uid ones).

---

## How it works

kasan drives the real CLIs and normalizes their output into one small set of
event kinds, which it stores in SQLite and pushes to any open browser over a
WebSocket. The two agents have genuinely different process models, and the
adapter layer exists to hide that:

**Claude Code is persistent.** One long-lived process per session:

```
claude -p --input-format stream-json --output-format stream-json --verbose
```

It reads your messages on stdin and emits events on stdout for as long as the
session lives.

**Codex is per-turn.** `codex exec --json` runs one turn and exits; the next
message is a fresh process via `codex exec resume <thread_id>`. Codex assigns
that thread id itself, so kasan records it, where for Claude Code it supplies
the id instead.

The useful consequence either way: **the conversation is not kept in memory.**
Both CLIs persist it to disk themselves, so kasan can park an idle agent, or be
restarted outright, and your next message resumes exactly where it left off.
Closing the tab costs you nothing.

```
server/
  index.ts            http + websockets + static files
  manager.ts          spawns agents, parks them, fans events out
  adapters/types.ts   the contract every agent implements
  adapters/claude.ts  persistent: stream-json over a long-lived stdin
  adapters/codex.ts   per-turn: exec + exec resume, item-based events
  db.ts               sqlite (node:sqlite — no native build step)
  auth.ts             passcode → signed cookie
  fsbrowse.ts         the repo picker, sandboxed to the workspace
web/src/              React. One screen per thing you can do.
```

Teaching kasan a third agent means writing one more file next to those two:
declare whether it is `persistent` or `per-turn`, build its argv, and translate
its output into the same event kinds. Nothing else has to change.

---

## The agent workbench

The runtime includes the tools an agent normally needs to investigate a repo,
not just edit its files:

| Area | Included tools |
| --- | --- |
| Search and source control | Git, ripgrep, OpenSSH |
| HTTP and data | curl, wget, jq, SQLite |
| Native builds | GCC/G++, make, Python 3, pip and venv |
| Diagnostics | procps, lsof, netcat, ShellCheck |
| Archives | zip and unzip |
| UI testing | Chromium, Playwright CLI, Playwright MCP |

Projects still own their dependencies. For example, an agent should use a
repository's local `@playwright/test`, pytest, or compiler when it has one. The
global tools are a dependable baseline for inspection and for bootstrapping a
missing test.

### Browser and UI inspection

On container startup kasan registers the bundled Playwright MCP server with
both Claude Code and Codex. It runs headlessly and gives either agent tools to:

- navigate, click, type, and work with multiple tabs;
- read the accessibility/DOM snapshot instead of guessing from HTML;
- inspect browser console output and network behavior;
- execute focused Playwright checks;
- take screenshots and PDFs; and
- use vision and browser developer tools when the task needs them.

The MCP server launches `/usr/bin/chromium` inside the kasan container. A web
app started by the agent in that same container is reachable at
`http://127.0.0.1:<port>`. It is not necessary to expose that port to the host
for automated inspection. Browser artifacts are temporary and go to
`/tmp/kasan-browser-artifacts`, keeping the repository clean.

Kasan leaves an existing MCP entry named `playwright` untouched, so a custom
browser setup in the persistent agent home wins over the bundled default. To
restore the default, remove that entry for the relevant CLI and restart kasan:

```bash
docker compose exec kasan claude mcp remove --scope user playwright
docker compose exec kasan codex mcp remove playwright
docker compose restart
```

### Keeping a preview alive between turns

Codex starts a fresh OS process for every turn. Use `kasan-preview` for a dev
server that should stay alive while the agent edits, visits, and retests the UI:

```bash
# Run from the project directory. Everything after -- is the project's command.
kasan-preview start --port 3000 -- npm run dev -- --host 0.0.0.0 --port 3000
kasan-preview status
kasan-preview logs --lines 200
kasan-preview stop
```

The helper waits until the requested TCP port accepts connections, captures
stdout and stderr, and detaches the whole process group from the agent turn.
State is keyed by the project directory, so different repositories can have
independent previews. Starting a second preview for the same project fails
clearly instead of leaking another server. The preview is container-local and
does not survive a container restart.

For frameworks that bind to loopback by default, the browser can still reach
the app. Passing `--host 0.0.0.0` is useful only if you also choose to publish
the preview port for human access.

### Trust and browser safety

Browser automation executes page JavaScript and can submit forms. It is not a
security boundary. The normal session trust level still controls the agent CLI,
but the browser can reach services available from the container. Do not give an
autonomous session credentials or network access you would not give its shell.
The bundled browser uses a fresh temporary profile; it does not inherit cookies
or logged-in sessions from your phone or desktop browser.

---

## Trust levels

Every session picks one when you create it. There is no approve/deny prompt in
kasan — you are usually not there to answer it — so each level is something the
agent is *started* with rather than something it asks about mid-run:

| Level          | Claude Code                            | Codex                      |
| -------------- | -------------------------------------- | -------------------------- |
| **just go**    | `bypassPermissions`                    | bypass approvals + sandbox |
| **edits only** | `acceptEdits`, with Bash removed       | `--sandbox workspace-write`|
| **read only**  | `plan` mode                            | `--sandbox read-only`      |

**just go** is the default and the reason this tool exists. The other two are
not identical across the agents — Claude Code has no sandbox, so "edits only"
takes its shell tool away entirely, while Codex keeps a shell but confines it to
the workspace.

The agent can read and write anything under `HOST_WORKSPACE`, and on **just go**
it will do so without asking. Mount only what you are willing to hand it.

---

## Security, honestly

- The passcode is the only lock. It is rate-limited, and the cookie it issues is
  HMAC-signed and lasts 30 days per device.
- Plain HTTP is fine **on a tailnet** and nowhere else. Do not port-forward this
  to the open internet. If you want it off your tailnet, put it behind
  `tailscale serve` or a reverse proxy with real TLS.
- The folder picker refuses to leave `KASAN_WORKSPACE`, but a **just go** session
  has a shell — treat access to kasan as equivalent to a shell on that machine.

---

## Everyday commands

```bash
docker compose logs -f          # what is it doing
docker compose restart          # nudge it
docker compose up -d --build    # after a git pull
docker compose down             # stop (sessions and login are kept)
```

After pulling a version that changes the workbench, rebuild rather than merely
restart so its system packages and global tools are installed:

```bash
docker compose up -d --build
```

Sessions and credentials live in the `kasan_kasan-home` and `kasan_kasan-data`
volumes. `docker compose down -v` deletes both — including your login.

---

## When something is wrong

**"… is not signed in on the server"** in a session
Run the command the session shows you — `claude setup-token`, or
`codex login --device-auth`. Neither agent's own `/login` works from the web UI,
because there is no interactive terminal there to complete the flow in.

**`codex login` opens a link that never completes**
You want `codex login --device-auth`. The plain form waits on a callback server
bound to loopback inside the container. See the note in *Get it running*.

**Wrong file owner on files the agent wrote**
The container writes as uid 1000. If `id -u` on your homelab says otherwise:

```bash
echo "KASAN_UID=$(id -u)" >> .env
echo "KASAN_GID=$(id -g)" >> .env
docker compose up -d --build
```

**Sessions do not appear / the page will not connect**
`docker compose logs -f`. A wrong `KASAN_PASSCODE` shows up as a 401 loop.

**`.gitconfig` mounted as a directory**
Compose mounts `~/.gitconfig` so the agent can commit as you. If you do not have
one, `touch ~/.gitconfig` and `docker compose up -d`, or drop that line.

---

## Developing on it

Node 24+, no build step for the server — it runs TypeScript directly.

```bash
npm install
KASAN_PASSCODE=dev KASAN_WORKSPACE=$HOME/repos npm run dev
```

Vite serves the UI on **7778** and proxies the API to the server on 7777.
