/**
 * Adapter for the Claude Code CLI.
 *
 * We drive it in its streaming JSON mode:
 *   claude -p --input-format stream-json --output-format stream-json --verbose
 * which keeps one long-lived process reading newline-delimited user messages on
 * stdin and emitting newline-delimited events on stdout. The conversation lives
 * in Claude Code's own on-disk session store, so `--resume` brings it back after
 * the process (or this whole server) has gone away.
 *
 * Everything below turns that raw firehose into the handful of event kinds the
 * web UI knows how to draw. Adding another agent means writing another file
 * shaped like this one.
 */

export type KEvent =
  | { kind: 'user'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool'; id: string; name: string; summary: string; input: unknown }
  | { kind: 'tool_result'; id: string; ok: boolean; preview: string }
  | { kind: 'turn_end'; costUsd: number; durationMs: number; numTurns: number; isError: boolean }
  | { kind: 'meta'; model?: string; permissionMode?: string; toolCount?: number }
  | { kind: 'notice'; text: string; tone?: 'info' | 'bad'; code?: string };

export type PermissionMode = 'bypassPermissions' | 'acceptEdits' | 'default';

export function buildArgs(opts: { sessionId: string; permissionMode: PermissionMode; resume: boolean }) {
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', opts.permissionMode,
  ];
  // A fresh conversation gets its id assigned; a returning one is resumed by it.
  args.push(opts.resume ? '--resume' : '--session-id', opts.sessionId);
  return args;
}

export function encodePrompt(text: string) {
  return `${JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] },
  })}\n`;
}

const oneLine = (s: unknown, max = 160) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const base = (p: unknown) => String(p ?? '').split('/').filter(Boolean).slice(-2).join('/');

/** A short human label for a tool call — this is all the UI shows by default. */
const summarizers: Record<string, (i: any) => string> = {
  Bash: (i) => oneLine(i.command),
  Read: (i) => base(i.file_path),
  Write: (i) => base(i.file_path),
  Edit: (i) => base(i.file_path),
  NotebookEdit: (i) => base(i.notebook_path),
  Glob: (i) => oneLine(i.pattern),
  Grep: (i) => oneLine(i.pattern),
  WebFetch: (i) => oneLine(i.url),
  WebSearch: (i) => oneLine(i.query),
  Task: (i) => oneLine(i.description),
  Skill: (i) => oneLine(i.skill),
  TodoWrite: (i) => `${i.todos?.length ?? 0} items`,
};

function summarize(name: string, input: any) {
  const fn = summarizers[name];
  if (fn) {
    try {
      const s = fn(input ?? {});
      if (s) return s;
    } catch {
      /* fall through to the generic form */
    }
  }
  return oneLine(JSON.stringify(input ?? {}), 80);
}

function previewOf(content: unknown): string {
  if (typeof content === 'string') return oneLine(content, 400);
  if (Array.isArray(content)) {
    return oneLine(
      content
        .map((b: any) => (b?.type === 'text' ? b.text : b?.type ? `[${b.type}]` : ''))
        .filter(Boolean)
        .join('\n'),
      400,
    );
  }
  return '';
}

/** Turn one raw stream-json line into zero or more UI events. */
export function normalize(raw: any): KEvent[] {
  const out: KEvent[] = [];

  switch (raw?.type) {
    case 'system':
      if (raw.subtype === 'init') {
        out.push({
          kind: 'meta',
          model: raw.model,
          permissionMode: raw.permissionMode,
          toolCount: Array.isArray(raw.tools) ? raw.tools.length : undefined,
        });
      }
      break;

    case 'assistant':
      // The CLI reports auth failures as an ordinary assistant message telling
      // you to run /login — which is a dead end here, since there is no
      // interactive session to run it in. Say what actually fixes it instead.
      if (raw.is_api_error_message) {
        const said = (raw.message?.content ?? [])
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join(' ')
          .trim();
        out.push({
          kind: 'notice',
          tone: 'bad',
          text:
            raw.error === 'authentication_failed'
              ? 'Claude Code is not signed in on the server. On the host, run:'
              : said || 'the agent hit an API error',
          ...(raw.error === 'authentication_failed'
            ? { code: 'docker compose exec kasan claude setup-token' }
            : {}),
        });
        break;
      }
      for (const b of raw.message?.content ?? []) {
        if (b.type === 'text' && b.text?.trim()) {
          out.push({ kind: 'text', text: b.text });
        } else if (b.type === 'thinking' && b.thinking?.trim()) {
          out.push({ kind: 'thinking', text: b.thinking });
        } else if (b.type === 'tool_use') {
          out.push({
            kind: 'tool',
            id: b.id,
            name: b.name,
            summary: summarize(b.name, b.input),
            input: b.input,
          });
        }
      }
      break;

    case 'user':
      // In this direction, `user` messages carry tool results back from the CLI.
      for (const b of raw.message?.content ?? []) {
        if (b.type === 'tool_result') {
          out.push({
            kind: 'tool_result',
            id: b.tool_use_id,
            ok: !b.is_error,
            preview: previewOf(b.content),
          });
        }
      }
      break;

    case 'result':
      out.push({
        kind: 'turn_end',
        costUsd: raw.total_cost_usd ?? 0,
        durationMs: raw.duration_ms ?? 0,
        numTurns: raw.num_turns ?? 0,
        isError: Boolean(raw.is_error),
      });
      break;

    // `rate_limit_event` and friends are deliberately dropped — they are noise
    // for someone glancing at a phone.
  }

  return out;
}
