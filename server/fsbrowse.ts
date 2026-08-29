import { readdir, stat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { config } from './config.ts';

/** Guard against escaping the configured workspace roots via `..` or symlinks. */
export function allowed(path: string) {
  const p = resolve(path);
  return config.workspace.some((root) => p === root || p.startsWith(root + sep));
}

export async function browse(path?: string) {
  // With no path, show the configured roots themselves.
  if (!path) {
    const roots = await Promise.all(
      config.workspace.map(async (p) => ({
        name: p.split(sep).filter(Boolean).pop() ?? p,
        path: p,
        repo: await isRepo(p),
      })),
    );
    return { path: null, parent: null, entries: roots };
  }

  const dir = resolve(path);
  if (!allowed(dir)) throw new Error('outside workspace');

  const names = await readdir(dir, { withFileTypes: true });
  const entries = await Promise.all(
    names
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
      .map(async (d) => {
        const p = join(dir, d.name);
        return { name: d.name, path: p, repo: await isRepo(p) };
      }),
  );
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const parent = resolve(dir, '..');
  return {
    path: dir,
    parent: allowed(parent) && parent !== dir ? parent : null,
    entries,
  };
}

async function isRepo(p: string) {
  try {
    return (await stat(join(p, '.git'))) ? true : false;
  } catch {
    return false;
  }
}
