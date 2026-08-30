import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// db.ts reads config at import time, so the environment has to be set up first.
process.env.KASAN_PASSCODE ||= 'test';
process.env.KASAN_DATA = mkdtempSync(join(tmpdir(), 'kasan-data-'));
const { store } = await import('./db.ts');
const { discoverArtifactBatches } = await import('./artifacts.ts');

function batchDir(cwd: string, id: string, manifest: Record<string, unknown>) {
  const dir = join(cwd, '.kasan', 'artifacts', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'one.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>');
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    version: 1, id, title: 'Options', artifacts: [{ id: 'one', file: 'one.svg', label: 'One' }], ...manifest,
  }));
}

const session = (id: string, cwd: string) =>
  store.createSession({ id, title: id, cwd, agent: 'claude', trust: 'go', model: null });

test('a batch presented in one session is claimed against every session in the folder', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'kasan-cwd-'));
  try {
    session('sess-a', cwd);
    session('sess-b', cwd);
    batchDir(cwd, 'dice-01', {});

    assert.equal(store.claimedBatchIds(cwd).size, 0);
    store.addEvent('sess-a', 'artifact_batch', { kind: 'artifact_batch', batchId: 'dice-01' });

    // The other session in the same folder must now treat it as spoken for.
    assert.ok(store.claimedBatchIds(cwd).has('dice-01'));
    // A session in a different folder is unaffected.
    assert.equal(store.claimedBatchIds(join(cwd, 'elsewhere')).size, 0);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('a manifest names the session it belongs to, and tolerates one that does not', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'kasan-cwd-'));
  try {
    batchDir(cwd, 'owned-01', { session: 'sess-a' });
    batchDir(cwd, 'legacy-01', {});
    batchDir(cwd, 'bogus-01', { session: '../../etc' });

    const byId = new Map(discoverArtifactBatches(cwd).map((b) => [b.batchId, b]));
    assert.equal(byId.get('owned-01')?.session, 'sess-a');
    assert.equal(byId.get('legacy-01')?.session, undefined);
    assert.equal(byId.get('bogus-01')?.session, undefined, 'an unsafe owner is dropped, not trusted');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
