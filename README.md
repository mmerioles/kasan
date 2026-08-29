# kasan

A quiet control room for coding agents.

kasan runs Claude Code on a machine you own and puts a very small web page in
front of it. Open that page from your phone, a laptop, or any other computer on
your Tailscale network, tell it what you want done, and walk away. The agent
keeps working whether or not anything is watching.

```
┌──────────────┐          ┌──────────────────────────────┐
│  phone /     │  https   │  homelab                     │
│  laptop /    │ ───────► │                              │
│  work pc     │ tailnet  │   kasan ──spawn──► claude    │
└──────────────┘          │     │                 │      │
                          │     └── sqlite        └─ your repos
                          └──────────────────────────────┘
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

Then log Claude Code in — **once**, ever:

```bash
docker compose exec kasan claude setup-token
```

It prints a URL. Open it, approve, paste the code back. The credential lands in
a Docker volume, so it survives restarts, rebuilds, and `docker compose down`.

Open **http://localhost:7777**, enter your passcode, and start a session.

> Prefer an API key to a subscription? Put `ANTHROPIC_API_KEY=sk-ant-...` in
> `.env` instead and skip `setup-token` entirely.

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

kasan drives the real CLI in its streaming JSON mode:

```
claude -p --input-format stream-json --output-format stream-json --verbose
```

That keeps **one long-lived process per session**, reading your messages on
stdin and emitting structured events — assistant text, each tool call, each
result, cost — on stdout. kasan normalizes those into a handful of event kinds,
stores them in SQLite, and pushes them to any open browser over a WebSocket.

The useful consequence: **the conversation is not kept in memory.** Claude Code
persists it to disk itself, so kasan can park an idle agent, or be restarted
outright, and your next message resumes exactly where it left off via
`--resume`. Closing the tab costs you nothing.

```
server/
  index.ts            http + websockets + static files
  manager.ts          spawns agents, parks them, fans events out
  adapters/claude.ts  argv + the stream-json → UI-event translation
  db.ts               sqlite (node:sqlite — no native build step)
  auth.ts             passcode → signed cookie
  fsbrowse.ts         the repo picker, sandboxed to the workspace
web/src/              React. One screen per thing you can do.
```

Teaching kasan another agent means writing one more file next to
`adapters/claude.ts` that turns its output into the same event kinds.

---

## Trust levels

Every session picks one when you create it:

- **just go** — runs unattended. This is the point of the tool, and the default.
- **ask before commands** — edits files freely, checks in on shell commands.
- **ask me everything** — pauses on every tool. Only useful if you are watching.

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

Sessions and credentials live in the `kasan_kasan-home` and `kasan_kasan-data`
volumes. `docker compose down -v` deletes both — including your login.

---

## When something is wrong

**"Claude Code is not signed in on the server"** in a session
Run `docker compose exec kasan claude setup-token`. The session itself tells
you this — `/login` will not work from the web UI, since there is no
interactive terminal there to complete the browser flow in.

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
