#!/usr/bin/env node
/** svgo, with a rendered before/after comparison as the guard. Optimisation
 *  quietly eats filter chains (the hand-drawn feTurbulence wobble is a prime
 *  victim), so the only safe check is whether the pixels moved.
 *
 *  node optimize.mjs asset.svg           # report only
 *  node optimize.mjs asset.svg --write   # keep it if the render is identical
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { shoot, TOKENS, arg, files } from './lib.mjs';

const write = process.argv.includes('--write');
const size = Number(arg('size', 512));
const tolerance = Number(arg('tolerance', 0.002)); // share of pixels allowed to differ

const render = (svg, out) => shoot({
  html: `<body style="margin:0;background:${TOKENS.light.paper};display:grid;place-items:center;height:${size}px">
    <div style="width:${size * 0.9}px;height:${size * 0.9}px">${svg.replace(/<svg /, '<svg style="width:100%;height:100%" ')}</div></body>`,
  out, width: size, height: size,
});

let failed = 0;
for (const f of files()) {
  const before = readFileSync(f, 'utf8');
  const after = execFileSync('svgo', ['--multipass', '-i', f, '-o', '-'], { encoding: 'utf8' });

  render(before, '/tmp/opt-before.png');
  render(after, '/tmp/opt-after.png');

  // AE counts differing pixels; a handful is antialiasing, a cliff is damage.
  let differing = 0;
  try {
    execFileSync('compare', ['-metric', 'AE', '/tmp/opt-before.png', '/tmp/opt-after.png', 'null:'],
      { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) { differing = Number(String(e.stderr).trim()) || 0; }

  const share = differing / (size * size * 4); // deviceScaleFactor 2 → 2x2 px
  const saved = 100 * (1 - after.length / before.length);
  const ok = share <= tolerance;
  console.log(`${basename(f)}  ${(statSync(f).size / 1024).toFixed(1)} KB → ${(after.length / 1024).toFixed(1)} KB (${saved.toFixed(0)}% smaller)`);
  console.log(`  ${ok ? '✓' : '✗'} ${differing} px differ (${(share * 100).toFixed(3)}%)${ok ? '' : ' — svgo changed how this renders, keeping the original'}`);

  if (!ok) { failed++; continue; }
  if (write) { writeFileSync(f, after); console.log('  written'); }
}
process.exit(failed ? 1 : 0);
