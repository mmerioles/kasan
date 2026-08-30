import { resolve } from 'node:path';

const env = process.env;

export const config = {
  port: Number(env.KASAN_PORT ?? 7777),
  host: env.KASAN_HOST ?? '0.0.0.0',
  passcode: env.KASAN_PASSCODE ?? '',
  dataDir: resolve(env.KASAN_DATA ?? './data'),
  idleMinutes: Number(env.KASAN_IDLE_MINUTES ?? 60),
  // A hung or self-perpetuating agent must not be allowed to spend forever.
  // Zero disables the guard deliberately.
  maxTurnMinutes: Number(env.KASAN_MAX_TURN_MINUTES ?? 30),
  maxToolsPerTurn: Number(env.KASAN_MAX_TOOLS_PER_TURN ?? 100),
  claudeBin: env.KASAN_CLAUDE_BIN ?? 'claude',
  workspace: (env.KASAN_WORKSPACE ?? process.cwd())
    .split(',')
    .map((p) => resolve(p.trim()))
    .filter(Boolean),
};

if (!config.passcode) {
  console.error('\n  kasan: KASAN_PASSCODE is not set. Copy .env.example to .env and set one.\n');
  process.exit(1);
}
