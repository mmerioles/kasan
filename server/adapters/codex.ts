/**
 * Codex.
 *
 * Codex has no persistent stdin mode: `codex exec --json` runs exactly one turn
 * and exits. Continuation is `codex exec resume <thread_id>`, and Codex assigns
 * that id itself (it arrives on `thread.started`), so unlike Claude Code we have
 * to learn the id rather than supply it.
 *
 * Its event stream is item-based. Items are announced on `item.started` and
 * finished on `item.completed`, so a long shell command shows up in the UI the
 * moment it begins rather than only once it is done.
 */
import type { Agent, KEvent, Parser, Trust } from './types.ts';
import { oneLine, tail } from './types.ts';

/** kasan's trust levels in Codex's sandbox terms. */
function sandboxArgs(trust: Trust): string[] {
  switch (trust) {
    case 'go':
      return ['--dangerously-bypass-approvals-and-sandbox'];
    case 'workspace':
      return ['--sandbox', 'workspace-write'];
    case 'read':
      return ['--sandbox', 'read-only'];
  }
}

/** A short label for whatever kind of item this is. */
function describe(item: any): { name: string; summary: string } {
  switch (item?.type) {
    case 'command_execution':
      return { name: 'Shell', summary: oneLine(item.command) };
    case 'file_change': {
      const changes = item.changes ?? [];
      const first = changes[0];
      return {
        name: 'Edit',
        summary:
          changes.length > 1
            ? `${changes.length} files`
            : tail(first?.path ?? item.path),
      };
    }
    case 'mcp_tool_call':
      return { name: item.server ? `${item.server}.${item.tool ?? ''}` : 'Tool', summary: oneLine(item.arguments, 80) };
    case 'web_search':
      return { name: 'Search', summary: oneLine(item.query) };
    case 'todo_list':
      return { name: 'Todo', summary: `${item.items?.length ?? 0} items` };
    default:
      return { name: item?.type ?? 'Item', summary: '' };
  }
}

/** Item kinds that read as a tool call rather than as prose. */
const TOOLISH = new Set(['command_execution', 'file_change', 'mcp_tool_call', 'web_search', 'todo_list']);

function resultOf(item: any): { ok: boolean; preview: string } {
  if (item?.type === 'command_execution') {
    return {
      ok: (item.exit_code ?? 0) === 0,
      preview: oneLine(item.aggregated_output ?? '', 400),
    };
  }
  if (item?.type === 'file_change') {
    const changes = item.changes ?? [];
    return {
      ok: item.status !== 'failed',
      preview: changes.map((c: any) => `${c.kind ?? 'update'}  ${c.path ?? ''}`).join('\n') || '(no changes)',
    };
  }
  if (item?.type === 'mcp_tool_call') {
    return { ok: item.status !== 'failed', preview: oneLine(JSON.stringify(item.result ?? ''), 400) };
  }
  return { ok: true, preview: '' };
}

const AUTH_RE = /401|unauthorized|not logged in|missing bearer|no auth|sign in/i;

/** Transport retry chatter. The turn.failed that follows carries the real message. */
const RETRY_RE = /^\s*(reconnecting\b|falling back from)/i;

export const codex: Agent = {
  id: 'codex',
  label: 'codex',
  bin: process.env.KASAN_CODEX_BIN ?? 'codex',
  mode: 'per-turn',

  plan({ resumeId, trust }) {
    // `-` makes Codex read the prompt from stdin, so length is never a problem.
    const args = resumeId ? ['exec', 'resume', resumeId, '-'] : ['exec', '-'];
    args.push('--json', '--skip-git-repo-check', ...sandboxArgs(trust));
    return { args, writePrompt: true };
  },

  newParser(): Parser {
    let threadId: string | null = null;
    const announced = new Set<string>();

    return {
      resumeId: () => threadId,
      handle(raw: any): KEvent[] {
        const out: KEvent[] = [];

        switch (raw?.type) {
          case 'thread.started':
            threadId = raw.thread_id ?? null;
            break;

          case 'item.started': {
            const item = raw.item;
            if (item && TOOLISH.has(item.type) && !announced.has(item.id)) {
              announced.add(item.id);
              const { name, summary } = describe(item);
              out.push({ kind: 'tool', id: item.id, name, summary, input: item });
            }
            break;
          }

          case 'item.completed': {
            const item = raw.item;
            if (!item) break;

            if (item.type === 'agent_message') {
              if (item.text?.trim()) out.push({ kind: 'text', text: item.text });
            } else if (item.type === 'reasoning') {
              if (item.text?.trim()) out.push({ kind: 'thinking', text: item.text });
            } else if (item.type === 'error') {
              if (!RETRY_RE.test(String(item.message ?? ''))) {
                out.push({ kind: 'notice', tone: 'bad', text: oneLine(item.message, 300) });
              }
            } else if (TOOLISH.has(item.type)) {
              // If we never saw item.started, announce it now so the result pairs.
              if (!announced.has(item.id)) {
                announced.add(item.id);
                const { name, summary } = describe(item);
                out.push({ kind: 'tool', id: item.id, name, summary, input: item });
              }
              const { ok, preview } = resultOf(item);
              out.push({ kind: 'tool_result', id: item.id, ok, preview });
            }
            break;
          }

          case 'turn.completed':
            out.push({
              kind: 'turn_end',
              costUsd: 0, // Codex reports tokens, not money
              durationMs: 0,
              numTurns: 1,
              isError: false,
            });
            break;

          case 'turn.failed': {
            const msg = raw.error?.message ?? 'the turn failed';
            out.push(
              AUTH_RE.test(msg)
                ? { kind: 'notice', tone: 'bad', ...codex.authHint }
                : { kind: 'notice', tone: 'bad', text: oneLine(msg, 300) },
            );
            out.push({ kind: 'turn_end', costUsd: 0, durationMs: 0, numTurns: 1, isError: true });
            break;
          }

          // `error` events are the retry chatter around a real failure; the
          // turn.failed that follows carries the message worth showing.
        }

        return out;
      },
    };
  },

  authHint: {
    // Plain `codex login` binds its OAuth callback to 127.0.0.1 inside the
    // container, so the browser can never reach it. Device auth has no callback.
    text: 'Codex is not signed in on the server. On the host, run:',
    code: 'docker compose exec kasan codex login --device-auth',
  },
};
