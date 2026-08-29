/**
 * A very small markdown reader.
 *
 * It builds React elements rather than HTML strings, so agent output can never
 * inject markup. It covers what Claude actually emits — fenced code, headings,
 * lists, quotes, and inline code/bold/italic/links — and deliberately nothing else.
 */
import { createElement as h, type ReactNode } from 'react';

let key = 0;
const k = () => `md${key++}`;

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const i = m.index!;
    if (i > last) out.push(text.slice(last, i));
    const tok = m[0];
    if (tok.startsWith('`')) {
      out.push(h('code', { key: k() }, tok.slice(1, -1)));
    } else if (tok.startsWith('**')) {
      out.push(h('strong', { key: k() }, tok.slice(2, -2)));
    } else if (tok.startsWith('[')) {
      const cut = tok.indexOf('](');
      const href = tok.slice(cut + 2, -1);
      const safe = /^https?:\/\//i.test(href) ? href : undefined;
      out.push(
        h('a', { key: k(), href: safe, target: '_blank', rel: 'noreferrer noopener' }, tok.slice(1, cut)),
      );
    } else {
      out.push(h('em', { key: k() }, tok.slice(1, -1)));
    }
    last = i + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function markdown(src: string): ReactNode[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = line.match(/^\s*```(\w*)/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence
      out.push(h('pre', { key: k() }, h('code', null, body.join('\n'))));
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    // heading
    const head = line.match(/^(#{1,6})\s+(.*)$/);
    if (head) {
      const level = Math.min(head[1].length, 3);
      out.push(h(`h${level}`, { key: k() }, inline(head[2])));
      i++;
      continue;
    }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(h('blockquote', { key: k() }, ...inline(body.join('\n'))));
      continue;
    }

    // lists
    const bullet = /^\s*[-*+]\s+/;
    const number = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || number.test(line)) {
      const ordered = !bullet.test(line);
      const re = ordered ? number : bullet;
      const items: ReactNode[] = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(h('li', { key: k() }, inline(lines[i].replace(re, ''))));
        i++;
      }
      out.push(h(ordered ? 'ol' : 'ul', { key: k() }, ...items));
      continue;
    }

    // paragraph — gather until a blank line or a block starter
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !bullet.test(lines[i]) &&
      !number.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    out.push(h('p', { key: k() }, ...inline(para.join('\n'))));
  }

  return out;
}
