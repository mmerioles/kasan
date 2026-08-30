#!/usr/bin/env node
/** Keep a repository's preview server alive independently of an agent turn. */
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cwd = process.cwd();
const key = createHash('sha256').update(cwd).digest('hex').slice(0, 16);
const dir = join(tmpdir(), 'kasan-previews', key);
const stateFile = join(dir, 'state.json');
const logFile = join(dir, 'preview.log');

const usage = () => {
  console.error(`usage:
  kasan-preview start --port <port> -- <command> [args...]
  kasan-preview status
  kasan-preview logs [--lines <n>]
  kasan-preview stop`);
  process.exit(2);
};

async function state() {
  try { return JSON.parse(await readFile(stateFile, 'utf8')); }
  catch { return null; }
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

function portOpen(port) {
  return new Promise((done) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (ok) => { socket.destroy(); done(ok); };
    socket.setTimeout(300);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

const [command, ...args] = process.argv.slice(2);
if (!command) usage();

if (command === 'start') {
  const divider = args.indexOf('--');
  const portAt = args.indexOf('--port');
  if (divider < 0 || portAt < 0 || !args[portAt + 1] || !args[divider + 1]) usage();
  const port = Number(args[portAt + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) usage();
  const existing = await state();
  if (existing && alive(existing.pid)) {
    console.error(`preview already running (pid ${existing.pid}, ${existing.url})`);
    process.exit(1);
  }

  await mkdir(dir, { recursive: true });
  const log = await open(logFile, 'w');
  const argv = args.slice(divider + 1);
  const child = spawn(argv[0], argv.slice(1), {
    cwd,
    detached: true,
    stdio: ['ignore', log.fd, log.fd],
    env: { ...process.env, BROWSER: 'none', FORCE_COLOR: '0' },
  });
  try {
    await new Promise((done, reject) => {
      child.once('spawn', done);
      child.once('error', reject);
    });
  } catch (error) {
    await log.close();
    await rm(stateFile, { force: true });
    console.error(`could not start preview: ${error.message}`);
    process.exit(1);
  }
  child.unref();
  await writeFile(stateFile, JSON.stringify({ pid: child.pid, port, url: `http://127.0.0.1:${port}`, cwd, argv, startedAt: Date.now() }, null, 2));
  await log.close();

  let ready = false;
  for (let i = 0; i < 60 && alive(child.pid); i += 1) {
    if (await portOpen(port)) { ready = true; break; }
    await new Promise((done) => setTimeout(done, 250));
  }
  if (!ready) {
    console.error(`preview did not open port ${port}; inspect: kasan-preview logs`);
    process.exit(1);
  }
  console.log(`preview ready at http://127.0.0.1:${port} (pid ${child.pid})`);
} else if (command === 'status') {
  const current = await state();
  if (!current || !alive(current.pid)) {
    console.log('preview is not running');
    process.exit(1);
  }
  console.log(`preview running at ${current.url} (pid ${current.pid})\n${current.argv.join(' ')}`);
} else if (command === 'logs') {
  const at = args.indexOf('--lines');
  const count = at >= 0 ? Math.max(1, Math.min(2000, Number(args[at + 1]) || 100)) : 100;
  try {
    const lines = (await readFile(logFile, 'utf8')).split('\n');
    process.stdout.write(lines.slice(-count).join('\n'));
  } catch { console.error('no preview log'); process.exit(1); }
} else if (command === 'stop') {
  const current = await state();
  if (!current || !alive(current.pid)) {
    await rm(stateFile, { force: true });
    console.log('preview is not running');
  } else {
    // Detached previews are process-group leaders; stop their children too.
    try { process.kill(-current.pid, 'SIGTERM'); } catch { process.kill(current.pid, 'SIGTERM'); }
    await rm(stateFile, { force: true });
    console.log(`stopped preview pid ${current.pid}`);
  }
} else {
  usage();
}
