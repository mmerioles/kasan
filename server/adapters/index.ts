import type { Agent, AgentId, Trust } from './types.ts';
import { claude, CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from './claude.ts';
import { codex, CODEX_MODELS, DEFAULT_CODEX_MODEL } from './codex.ts';

export const agents: Record<AgentId, Agent> = { claude, codex };

export const AGENT_IDS = Object.keys(agents) as AgentId[];

export const isAgentId = (v: unknown): v is AgentId =>
  typeof v === 'string' && (AGENT_IDS as string[]).includes(v);

export const TRUSTS: Trust[] = ['go', 'workspace', 'read'];

export const isTrust = (v: unknown): v is Trust =>
  typeof v === 'string' && (TRUSTS as string[]).includes(v);

export type ModelOption = { id: string; label: string; hint: string };

export const MODELS: Record<AgentId, readonly ModelOption[]> = { claude: CLAUDE_MODELS, codex: CODEX_MODELS };
export const DEFAULT_MODEL: Record<AgentId, string> = { claude: DEFAULT_CLAUDE_MODEL, codex: DEFAULT_CODEX_MODEL };

export const isModelFor = (agentId: AgentId, value: unknown): value is string =>
  MODELS[agentId].some((m) => m.id === value);

/** Map a model id an agent reports back onto the picker's own list.
 *
 *  kasan stores the short id it passes as `--model` (`opus`), but the CLIs
 *  report the concrete model they resolved to (`claude-opus-5`). The two have
 *  to be reconciled, or a stored report would sit outside the list of things
 *  the picker can select. Returns null when it matches nothing. */
export const resolveModel = (agentId: AgentId, reported: string): string | null => {
  const value = reported.toLowerCase();
  return (
    MODELS[agentId].find((m) => m.id === value)?.id ??
    MODELS[agentId].find((m) => value.includes(m.id))?.id ??
    null
  );
};

export type { Agent, AgentId, Trust };
export type { KEvent } from './types.ts';
