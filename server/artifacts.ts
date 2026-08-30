import { existsSync, realpathSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import type { KEvent } from './adapters/types.ts';

const ARTIFACT_DIR = '.kasan/artifacts';
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

type Manifest = {
  version?: number;
  id?: string;
  title?: string;
  prompt?: string;
  multiple?: boolean;
  artifacts?: { id?: string; file?: string; label?: string; description?: string }[];
};

const cleanText = (value: unknown, fallback: string, max = 160) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, max);
};

/** Read completed asset manifests. Invalid/incomplete batches are ignored. */
export function discoverArtifactBatches(cwd: string): Extract<KEvent, { kind: 'artifact_batch' }>[] {
  const root = resolve(cwd, ARTIFACT_DIR);
  if (!existsSync(root)) return [];

  let rootReal: string;
  try { rootReal = realpathSync(root); } catch { return []; }

  const batches: Extract<KEvent, { kind: 'artifact_batch' }>[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !SAFE_ID.test(entry.name)) continue;
    const batchDir = join(root, entry.name);
    const manifestFile = join(batchDir, 'manifest.json');
    if (!existsSync(manifestFile)) continue;

    try {
      const batchReal = realpathSync(batchDir);
      if (!batchReal.startsWith(`${rootReal}/`)) continue;
      const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as Manifest;
      const batchId = SAFE_ID.test(String(manifest.id ?? '')) ? String(manifest.id) : entry.name;
      if (batchId !== entry.name || !Array.isArray(manifest.artifacts)) continue;

      const artifacts = manifest.artifacts.flatMap((item, index) => {
        const file = String(item.file ?? '');
        const id = String(item.id ?? `option-${index + 1}`);
        if (!SAFE_ID.test(id) || basename(file) !== file || !MIME[extname(file).toLowerCase()]) return [];
        const full = join(batchDir, file);
        if (!existsSync(full) || !statSync(full).isFile() || statSync(full).size > 8_000_000) return [];
        if (!realpathSync(full).startsWith(`${batchReal}/`)) return [];
        return [{
          id,
          file,
          label: cleanText(item.label, `Option ${index + 1}`, 80),
          description: cleanText(item.description, '', 200),
        }];
      }).slice(0, 12);

      if (artifacts.length) batches.push({
        kind: 'artifact_batch',
        batchId,
        title: cleanText(manifest.title, 'Asset options'),
        prompt: cleanText(manifest.prompt, 'Choose an option to continue.'),
        multiple: Boolean(manifest.multiple),
        artifacts,
      });
    } catch {
      // A manifest is the agent's working file until it is valid and complete.
    }
  }
  return batches;
}

export function resolveArtifact(cwd: string, batchId: string, file: string) {
  if (!SAFE_ID.test(batchId) || basename(file) !== file) return null;
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) return null;

  try {
    const root = realpathSync(resolve(cwd, ARTIFACT_DIR));
    const batch = realpathSync(join(root, batchId));
    const target = realpathSync(join(batch, file));
    if (!batch.startsWith(`${root}/`) || !target.startsWith(`${batch}/`)) return null;
    const stat = statSync(target);
    if (!stat.isFile() || stat.size > 8_000_000) return null;
    return { path: target, mime, size: stat.size };
  } catch {
    return null;
  }
}
