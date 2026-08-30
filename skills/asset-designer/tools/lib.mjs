/** Shared plumbing for the asset tools: one renderer, one set of tokens. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOKENS = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'tokens.json'), 'utf8'),
);

const work = mkdtempSync(join(tmpdir(), 'asset-'));

/** Chromium is the only renderer that agrees with where these assets ship.
 *  rsvg-convert is installed on this box and silently renders CSS-styled SVG
 *  (custom properties, class selectors) as solid black — never trust it. */
export function shoot({ html, url, out, width, height }) {
  let target = url;
  if (!target) {
    const file = join(work, `p-${Math.random().toString(36).slice(2)}.html`);
    writeFileSync(file, html);
    target = 'file://' + file;
  }
  execFileSync('chromium', [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=2', `--window-size=${width},${height}`,
    `--screenshot=${out}`, target,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  return out;
}

/** Runs page JS and hands back what it put in #out — chromium's CLI has no
 *  other way to return a value. */
export function evaluate({ html, script }) {
  const file = join(work, `e-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(file, `${html}<pre id="out"></pre><script>
    (async () => { try { document.getElementById('out').textContent =
      JSON.stringify(await (${script})()); } catch (e) {
      document.getElementById('out').textContent = JSON.stringify({ error: String(e) }); } })();
  </script>`);
  const dom = execFileSync('chromium', [
    '--headless', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=2000',
    '--dump-dom', 'file://' + file,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  try { return JSON.parse(m?.[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') ?? 'null'); }
  catch { return null; }
}

/** Grayscale min/max/spread of a render — how visible the asset actually is. */
export function luminance(png) {
  const [min, max, sd] = execFileSync('convert', [
    png, '-colorspace', 'Gray', '-format', '%[fx:minima] %[fx:maxima] %[fx:standard_deviation]', 'info:',
  ], { encoding: 'utf8' }).trim().split(/\s+/).map(Number);
  return { min, max, spread: max - min, sd };
}

export const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
export const files = () => process.argv.slice(2).filter((a) => !a.startsWith('--'));
