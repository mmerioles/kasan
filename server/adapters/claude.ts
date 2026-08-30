/**
 * Claude Code.
 *
 * Driven in its streaming JSON mode, which keeps one long-lived process reading
 * newline-delimited user messages on stdin and emitting events on stdout. The
 * conversation lives in Claude Code's own on-disk store, so `--resume` brings it
 * back after the process (or this whole server) has gone away — which is why an
 * idle agent can be parked for free.
 */
import type { Agent, KEvent, Parser, Trust } from './types.ts';
import { oneLine, tail } from './types.ts';

/** kasan's trust levels in Claude Code's terms. */
function permissionArgs(trust: Trust): string[] {
  switch (trust) {
    case 'go':
      return ['--permission-mode', 'bypassPermissions'];
    case 'workspace':
      // Edits are auto-accepted; Bash is removed outright rather than left to
      // stall on a prompt no one can answer from a phone.
      return ['--permission-mode', 'acceptEdits', '--disallowed-tools', 'Bash'];
    case 'read':
      return ['--permission-mode', 'plan'];
  }
}

const summarizers: Record<string, (i: any) => string> = {
  Bash: (i) => oneLine(i.command),
  Read: (i) => tail(i.file_path),
  Write: (i) => tail(i.file_path),
  Edit: (i) => tail(i.file_path),
  NotebookEdit: (i) => tail(i.notebook_path),
  Glob: (i) => oneLine(i.pattern),
  Grep: (i) => oneLine(i.pattern),
  WebFetch: (i) => oneLine(i.url),
  WebSearch: (i) => oneLine(i.query),
  Task: (i) => oneLine(i.description),
  Skill: (i) => oneLine(i.skill),
  TodoWrite: (i) => `${i.todos?.length ?? 0} items`,
};

function summarize(name: string, input: any) {
  try {
    const s = summarizers[name]?.(input ?? {});
    if (s) return s;
  } catch {
    /* fall through */
  }
  return oneLine(JSON.stringify(input ?? {}), 80);
}

function previewOf(content: unknown): string {
  if (typeof content === 'string') return oneLine(content, 400);
  if (Array.isArray(content)) {
    return oneLine(
      content.map((b: any) => (b?.type === 'text' ? b.text : b?.type ? `[${b.type}]` : '')).filter(Boolean).join('\n'),
      400,
    );
  }
  return '';
}

export const claude: Agent = {
  id: 'claude',
  label: 'claude',
  bin: process.env.KASAN_CLAUDE_BIN ?? 'claude',
  mode: 'persistent',

  plan({ sessionId, started, trust }) {
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      ...permissionArgs(trust),
    ];
    // A fresh conversation gets its id assigned; a returning one is resumed by it.
    args.push(started ? '--resume' : '--session-id', sessionId);
    return { args, writePrompt: false };
  },

  encodePrompt(text) {
    return `${JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text }] },
    })}\n`;
  },

  newParser(): Parser {
    return {
      resumeId: () => null, // we supply the id, so there is nothing to learn
      handle(raw: any): KEvent[] {
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

          case 'assistant': {
            // Auth failures arrive as an ordinary assistant message telling you
            // to run /login, which is a dead end here. Say what actually fixes it.
            if (raw.is_api_error_message) {
              const said = (raw.message?.content ?? [])
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text)
                .join(' ')
                .trim();
              out.push(
                raw.error === 'authentication_failed'
                  ? { kind: 'notice', tone: 'bad', ...claude.authHint }
                  : { kind: 'notice', tone: 'bad', text: said || 'the agent hit an API error' },
              );
              break;
            }
            for (const b of raw.message?.content ?? []) {
              if (b.type === 'text' && b.text?.trim()) out.push({ kind: 'text', text: b.text });
              else if (b.type === 'thinking' && b.thinking?.trim()) out.push({ kind: 'thinking', text: b.thinking });
              else if (b.type === 'tool_use') {
                out.push({ kind: 'tool', id: b.id, name: b.name, summary: summarize(b.name, b.input), input: b.input });
              }
            }
            break;
          }

          case 'user':
            // In this direction, `user` messages carry tool results back.
            for (const b of raw.message?.content ?? []) {
              if (b.type === 'tool_result') {
                out.push({ kind: 'tool_result', id: b.tool_use_id, ok: !b.is_error, preview: previewOf(b.content) });
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
        }
        return out;
      },
    };
  },

  authHint: {
    // There is no browser in the container, so the surest route is to mint the
    // token somewhere that has one and hand it over through the environment.
    text: 'Claude Code is not signed in. Run `claude setup-token` where you have a browser, then put this in .env and restart kasan:',
    code: 'CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-…',
  },
};
