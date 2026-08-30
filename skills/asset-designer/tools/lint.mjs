#!/usr/bin/env node
/** The checks an eye cannot do: geometry escaping the viewBox, hairlines that
 *  vanish at the small size, ink that disappears on one theme, fonts that are
 *  not really there. Exits non-zero on an error so it can gate a hand-off.
 *
 *  node lint.mjs asset.svg --min=16
 */
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { shoot, evaluate, luminance, TOKENS, arg, files } from './lib.mjs';

const min = Number(arg('min', 16));
const assets = files();
if (!assets.length) { console.error('usage: lint.mjs <asset.svg...> [--min=16]'); process.exit(1); }

let errors = 0;
for (const f of assets) {
  const src = readFileSync(f, 'utf8');
  const out = [];
  const bad = (m) => { out.push(`  ✗ ${m}`); errors++; };
  const warn = (m) => out.push(`  ! ${m}`);

  const viewBox = src.match(/viewBox="([\d.\-\s]+)"/)?.[1].trim().split(/\s+/).map(Number);
  if (!viewBox || viewBox.length !== 4) bad('no viewBox — the asset cannot scale');
  if (/<script/i.test(src)) bad('contains <script>');
  const external = [...src.matchAll(/(?:href|src)="(https?:[^"]+)"/g)].map((m) => m[1]);
  if (external.length) bad(`external reference(s): ${external.join(', ')} — inline or embed instead`);
  if (/<foreignObject/i.test(src)) warn('<foreignObject> does not survive rasterisation everywhere');
  if (/<text/i.test(src)) warn('live <text> — convert to paths, or it reflows wherever the font is missing');

  const kb = statSync(f).size / 1024;
  if (kb > 200) warn(`${kb.toFixed(0)} KB is heavy for a vector asset`);

  // Strokes are in user units; what matters is how many device pixels survive.
  if (viewBox) {
    const scale = min / Math.max(viewBox[2], viewBox[3]);
    const widths = [...src.matchAll(/stroke-width[:=]"?\s*([\d.]+)/g)].map((m) => Number(m[1]));
    const thin = [...new Set(widths)].filter((w) => w * scale < 0.75).sort((a, b) => a - b);
    if (thin.length) warn(`stroke-width ${thin.join(', ')} renders under 0.75px at ${min}px — it will drop out`);
  }

  const probe = evaluate({
    html: `<div id="w" style="width:400px;height:400px">${src}</div>`,
    script: `() => { const s = document.querySelector('#w svg');
      const vb = s.viewBox.baseVal, b = s.getBBox();
      const fonts = [...s.querySelectorAll('*')].map(e => getComputedStyle(e).fontFamily)
        .filter(Boolean).flatMap(v => v.split(',')).map(v => v.trim().replace(/^["']|["']$/g,''));
      return { vb: [vb.x, vb.y, vb.width, vb.height], bbox: [b.x, b.y, b.width, b.height],
        missing: [...new Set(fonts)].filter(n => n && !document.fonts.check('16px "' + n + '"')) }; }`,
  });
  if (probe?.bbox && probe.vb) {
    const [vx, vy, vw, vh] = probe.vb, [bx, by, bw, bh] = probe.bbox;
    const over = Math.max(vx - bx, vy - by, (bx + bw) - (vx + vw), (by + bh) - (vy + vh));
    if (over > 0.5) bad(`geometry runs ${over.toFixed(1)} units past the viewBox — it will be clipped`);
  }
  if (probe?.missing?.length && /<text/i.test(src)) {
    warn(`font not installed here: ${probe.missing.join(', ')} — the render above is a substitute`);
  }

  // Ink that does not separate from the paper is invisible, not subtle.
  for (const theme of ['light', 'dark']) {
    const png = shoot({
      html: `<body style="margin:0;background:${TOKENS[theme].paper};display:grid;place-items:center;height:128px">
        <div style="width:96px;height:96px">${src.replace(/<svg /, '<svg style="width:100%;height:100%" ')}</div></body>`,
      out: `/tmp/lint-${theme}.png`, width: 128, height: 128,
    });
    const { spread } = luminance(png);
    if (spread < 0.25) bad(`almost invisible on ${theme} paper (luminance spread ${spread.toFixed(2)})`);
    else if (spread < 0.45) warn(`low contrast on ${theme} paper (spread ${spread.toFixed(2)})`);
  }

  console.log(`${basename(f)}${out.length ? '' : '  ✓ clean'}`);
  out.forEach((l) => console.log(l));
}
process.exit(errors ? 1 : 0);
