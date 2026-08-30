import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';

const MAX_IMAGE_BYTES = 8_000_000;
const SAFE_FILE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.png$/;

function run(command: string, args: string[], timeout = 30_000) {
  return new Promise<void>((done, reject) => {
    execFile(command, args, { timeout, maxBuffer: 1_000_000 }, (error, _stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else done();
    });
  });
}

function feedbackDir(cwd: string) {
  return resolve(cwd, '.kasan', 'feedback');
}

function safeWebUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('only http and https URLs can be captured');
  url.username = '';
  url.password = '';
  return url.toString();
}

async function detectedPreviewUrl(cwd: string) {
  const key = createHash('sha256').update(resolve(cwd)).digest('hex').slice(0, 16);
  try {
    const state = JSON.parse(await readFile(join(tmpdir(), 'kasan-previews', key, 'state.json'), 'utf8'));
    if (typeof state.url === 'string') return safeWebUrl(state.url);
  } catch { /* no preview for this repository */ }
  return null;
}

export async function captureScreenshot(cwd: string, requestedUrl?: string) {
  const url = requestedUrl?.trim() ? safeWebUrl(requestedUrl.trim()) : await detectedPreviewUrl(cwd);
  if (!url) throw new Error('no preview detected; start kasan-preview or enter a URL');

  const dir = feedbackDir(cwd);
  const browserDir = join(tmpdir(), `kasan-capture-${randomUUID()}`);
  const file = `capture-${Date.now()}.png`;
  const target = join(dir, file);
  await mkdir(dir, { recursive: true });
  await mkdir(browserDir, { recursive: true });
  try {
    await run('chromium', [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=1440,1000',
      `--user-data-dir=${browserDir}`, `--screenshot=${target}`, url,
    ]);
  } finally {
    await rm(browserDir, { recursive: true, force: true });
  }
  const image = await readFile(target);
  if (!image.length || image.length > MAX_IMAGE_BYTES) {
    await rm(target, { force: true });
    throw new Error('captured image is empty or too large');
  }
  return { file, url, relativePath: relative(cwd, target) };
}

export async function saveAnnotation(cwd: string, dataUrl: string) {
  const match = /^data:image\/png;base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('annotation must be a PNG image');
  const image = Buffer.from(match[1], 'base64');
  if (!image.length || image.length > MAX_IMAGE_BYTES) throw new Error('annotation image is empty or too large');
  const dir = feedbackDir(cwd);
  const file = `annotation-${Date.now()}.png`;
  const target = join(dir, file);
  await mkdir(dir, { recursive: true });
  await writeFile(target, image, { flag: 'wx' });
  return { file, relativePath: relative(cwd, target), absolutePath: target };
}

export function resolveFeedback(cwd: string, file: string) {
  if (!SAFE_FILE.test(file) || basename(file) !== file) return null;
  const root = feedbackDir(cwd);
  const target = resolve(root, file);
  if (!target.startsWith(`${root}/`)) return null;
  return target;
}
