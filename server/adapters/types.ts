/**
 * What every agent adapter has to provide.
 *
 * The two agents kasan drives have genuinely different process models, and the
 * interface exists to hide that from the rest of the server:
 *
 *   persistent — one process for the whole session, prompts written to its
 *                stdin as they arrive (Claude Code's stream-json mode).
 *   per-turn   — a fresh process for every prompt, which exits when the turn
 *                is done and is brought back with a resume id (Codex exec).
 */

export type KEvent =
  | { kind: 'user'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool'; id: string; name: string; summary: string; input: unknown }
  | { kind: 'tool_result'; id: string; ok: boolean; preview: string }
  | { kind: 'turn_end'; costUsd: number; durationMs: number; numTurns: number; isError: boolean }
  | { kind: 'meta'; model?: string; permissionMode?: string; toolCount?: number }
  | {
      kind: 'artifact_batch';
      batchId: string;
      /** Session the batch was written for; absent on batches with no owner. */
      session?: string;
      title: string;
      prompt: string;
      multiple: boolean;
      artifacts: { id: string; file: string; label: string; description: string }[];
    }
  | { kind: 'artifact_choice'; batchId: string; ids: string[] }
  | { kind: 'notice'; text: string; tone?: 'info' | 'bad'; code?: string };

/** What the session was told it may do. Mapped per agent — see each adapter. */
export type Trust = 'go' | 'workspace' | 'read';

export type AgentId = 'claude' | 'codex';

export type SpawnPlan = {
  args: string[];
  /** Write the prompt to stdin at launch (per-turn agents), then close it.
   *  Persistent agents leave this false and stream prompts in as they arrive. */
  writePrompt: boolean;
};

/** Per-run state. Codex streams items that need pairing across events. */
export type Parser = {
  handle(raw: unknown): KEvent[];
  /** The agent's own id for this conversation, once it has told us. */
  resumeId(): string | null;
};

export type Agent = {
  id: AgentId;
  label: string;
  bin: string;
  mode: 'persistent' | 'per-turn';
  /**
   * Build argv for a run.
   *  - `sessionId` is kasan's id, which Claude Code adopts as its own.
   *  - `resumeId` is the agent's own id for the conversation, null the first time.
   *  - `started` is whether this session has ever been run before.
   */
  plan(opts: {
    sessionId: string;
    resumeId: string | null;
    started: boolean;
    trust: Trust;
    model: string | null;
  }): SpawnPlan;
  /** Encode a prompt for a persistent agent's stdin. */
  encodePrompt?(text: string): string;
  newParser(): Parser;
  /** Shown when the agent turns out not to be signed in. */
  authHint: { text: string; code: string };
};

export const oneLine = (s: unknown, max = 160) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

export const tail = (p: unknown, n = 2) =>
  String(p ?? '').split('/').filter(Boolean).slice(-n).join('/');
