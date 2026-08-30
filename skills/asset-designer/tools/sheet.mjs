#!/usr/bin/env node
/** Contact sheet: every asset at every target size, on light and dark paper,
 *  in ONE image. Judging a set side by side is the whole point — a stack of
 *  separate renders does not show which option is strongest.
 *
 *  node sheet.mjs a.svg b.svg --sizes=16,24,48,160 --out=sheet.png
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { shoot, TOKENS, arg, files } from './lib.mjs';

const sizes = arg('sizes', '16,24,48,160').split(',').map(Number).sort((a, b) => a - b);
const out = arg('out', 'sheet.png');
const themes = arg('themes', 'light,dark').split(',');
const assets = files();
if (!assets.length) { console.error('usage: sheet.mjs <asset.svg...> [--sizes=] [--out=]'); process.exit(1); }

const HEAD = 30, PAD = 24, LABEL = 22;
const rowH = HEAD + PAD * 2 + Math.max(...sizes) + LABEL;
const width = 64 + sizes.reduce((sum, px) => sum + Math.max(px, 34) + 30, 0);

const rows = themes.flatMap((name) => {
  const t = TOKENS[name];
  return assets.map((f) => {
    const svg = readFileSync(f, 'utf8')
      .replace(/<\?xml[\s\S]*?\?>/, '')
      .replace(/<svg /, '<svg style="width:100%;height:100%;display:block" ');
    const cells = sizes.map((px) => `<div style="display:flex;flex-direction:column;align-items:center;gap:8px">
        <div style="width:${px}px;height:${px}px;display:grid;place-items:center;flex:none">${svg}</div>
        <div style="font:11px/1 ui-monospace,monospace;color:${t.ink};opacity:.5">${px}</div>
      </div>`).join('');
    return `<div style="box-sizing:border-box;height:${rowH}px;background:${t.paper};padding:${PAD}px 32px;overflow:hidden">
      <div style="height:${HEAD}px;font:600 12px/1 ui-monospace,monospace;color:${t.ink};opacity:.65">${basename(f)} · ${name}</div>
      <div style="display:flex;gap:30px;align-items:flex-end">${cells}</div></div>`;
  });
});

shoot({
  html: `<body style="margin:0">${rows.join('')}</body>`,
  out, width, height: rowH * rows.length,
});
console.log(`${out}  ${assets.length} asset(s) × ${sizes.length} sizes × ${themes.length} themes`);
