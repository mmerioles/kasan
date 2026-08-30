import type { Agent, AgentId, Trust } from './types.ts';
import { claude } from './claude.ts';
import { codex } from './codex.ts';

export const agents: Record<AgentId, Agent> = { claude, codex };

export const AGENT_IDS = Object.keys(agents) as AgentId[];

export const isAgentId = (v: unknown): v is AgentId =>
  typeof v === 'string' && (AGENT_IDS as string[]).includes(v);

export const TRUSTS: Trust[] = ['go', 'workspace', 'read'];

export const isTrust = (v: unknown): v is Trust =>
  typeof v === 'string' && (TRUSTS as string[]).includes(v);

export type { Agent, AgentId, Trust };
export type { KEvent } from './types.ts';
