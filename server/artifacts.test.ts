import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { discoverArtifactBatches, resolveArtifact } from './artifacts.ts';

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'kasan-artifacts-'));
  const batch = join(cwd, '.kasan', 'artifacts', 'icons-01');
  mkdirSync(batch, { recursive: true });
  writeFileSync(join(batch, 'one.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>');
  writeFileSync(join(batch, 'manifest.json'), JSON.stringify({
    version: 1,
    id: 'icons-01',
    title: 'Icon options',
    artifacts: [{ id: 'one', file: 'one.svg', label: 'One' }],
  }));
  return cwd;
}

test('discovers valid batches and resolves their files', () => {
  const cwd = fixture();
  try {
    const batches = discoverArtifactBatches(cwd);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].artifacts[0].file, 'one.svg');
    assert.equal(resolveArtifact(cwd, 'icons-01', 'one.svg')?.mime, 'image/svg+xml');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('rejects traversal, unsupported files, and escaping symlinks', () => {
  const cwd = fixture();
  const batch = join(cwd, '.kasan', 'artifacts', 'icons-01');
  try {
    writeFileSync(join(cwd, 'secret.svg'), '<svg/>');
    symlinkSync(join(cwd, 'secret.svg'), join(batch, 'escape.svg'));
    assert.equal(resolveArtifact(cwd, '..', 'one.svg'), null);
    assert.equal(resolveArtifact(cwd, 'icons-01', '../secret.svg'), null);
    assert.equal(resolveArtifact(cwd, 'icons-01', 'manifest.json'), null);
    assert.equal(resolveArtifact(cwd, 'icons-01', 'escape.svg'), null);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
