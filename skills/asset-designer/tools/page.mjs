#!/usr/bin/env node
/** An asset judged alone is judged wrong — optical weight only reads next to
 *  the type and spacing it ships beside. Shoots a real page at real widths.
 *
 *  node page.mjs site/index.html --widths=390,1200
 */
import { resolve } from 'node:path';
import { shoot, arg, files } from './lib.mjs';

const widths = arg('widths', '390,1200').split(',').map(Number);
const height = Number(arg('height', 900));
const out = arg('out', 'page');
const target = files()[0];
if (!target) { console.error('usage: page.mjs <file.html|url> [--widths=390,1200]'); process.exit(1); }
const url = /^https?:/.test(target) ? target : 'file://' + resolve(target);

for (const w of widths) {
  const file = `${out}-${w}.png`;
  shoot({ url, out: file, width: w, height });
  console.log(`${file}  ${w}×${height}`);
}
console.log('\nDark mode: chromium here follows prefers-color-scheme: light. To see dark,\nadd a temporary [data-theme] override or shoot the app with its own toggle set.');
