import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { config } from './config.ts';

const COOKIE = 'kasan_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days — log in once per device.
const secret = createHmac('sha256', 'kasan').update(config.passcode).digest();

function sign(expiry: number) {
  return createHmac('sha256', secret).update(String(expiry)).digest('hex');
}

export function issueToken() {
  const expiry = Date.now() + TTL_MS;
  return `${expiry}.${sign(expiry)}`;
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function checkPasscode(input: unknown) {
  return typeof input === 'string' && safeEqual(input, config.passcode);
}

export function verifyToken(token: string | undefined) {
  if (!token) return false;
  const [expiry, mac] = token.split('.');
  if (!expiry || !mac) return false;
  if (Number(expiry) < Date.now()) return false;
  return safeEqual(mac, sign(Number(expiry)));
}

export function readCookie(req: IncomingMessage, name = COOKIE) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export const isAuthed = (req: IncomingMessage) => verifyToken(readCookie(req));

export function cookieHeader(token: string) {
  // No `Secure` — this is served over plain HTTP on a tailnet.
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** Rate limiter for the login endpoint, so the passcode can't be brute forced. */
const attempts = new Map<string, { n: number; until: number }>();
export function loginAllowed(ip: string) {
  const rec = attempts.get(ip);
  if (rec && rec.until > Date.now()) return false;
  return true;
}
export function noteLogin(ip: string, ok: boolean) {
  if (ok) return attempts.delete(ip);
  const rec = attempts.get(ip) ?? { n: 0, until: 0 };
  rec.n += 1;
  if (rec.n >= 5) {
    rec.until = Date.now() + 60_000 * Math.min(rec.n - 4, 10);
  }
  attempts.set(ip, rec);
}

/** Claude Code requires a real UUID for `--session-id`. */
export const newId = () => randomUUID();
