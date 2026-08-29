import type { ReactNode } from 'react';

/**
 * The displacement filter every drawn border runs through. Rendered once, at
 * the root — it is what makes straight CSS borders look like they were drawn
 * by a hand that had had a coffee.
 */
export function WobbleDefs() {
  return (
    <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
      <filter id="wobble" x="-8%" y="-8%" width="116%" height="116%">
        <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

export function Dot({ status }: { status: string }) {
  const cls =
    status === 'working' ? 'dot working' : status === 'error' ? 'dot err' : 'dot on';
  return (
    <svg className={cls} viewBox="0 0 12 12" aria-label={status}>
      <circle cx="6" cy="6" r="4.4" />
    </svg>
  );
}

export function Radio({ on }: { on: boolean }) {
  return (
    <svg className="mark" width="17" height="17" viewBox="0 0 17 17" aria-hidden>
      <circle cx="8.5" cy="8.5" r="6.6" filter="url(#wobble)" />
      {on && <circle className="fill" cx="8.5" cy="8.5" r="3.5" filter="url(#wobble)" />}
    </svg>
  );
}

export function Pending() {
  return (
    <span className="pending" aria-label="working">
      <i /><i /><i />
    </span>
  );
}

/** One twin-drill, drawn as a tapering coil. Rendered twice, mirrored. */
function Drill() {
  return (
    <g>
      <ellipse cx="0" cy="0" rx="12" ry="4.3" />
      <ellipse cx="0" cy="6.6" rx="10.3" ry="3.7" />
      <ellipse cx="0" cy="12.9" rx="8.9" ry="3.2" />
      <ellipse cx="0" cy="18.8" rx="7.6" ry="2.7" />
      <ellipse cx="0" cy="24.4" rx="6.6" ry="2.4" />
      <ellipse cx="0" cy="29.8" rx="5.6" ry="2" />
      <ellipse cx="0" cy="34.8" rx="4.9" ry="1.7" />
      <path d="M-12 0 -3.8 39.7" />
      <path d="M12 0 3.8 39.7" />
      <path d="M-3.8 39.7q3.8 4 7.5 0" />
    </g>
  );
}

/** Teto, twin drills and all — the login screen. */
export function DoodleTeto() {
  return (
    <svg width="150" height="132" viewBox="-75 -46 150 122" fill="none" aria-hidden
         stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <g filter="url(#wobble)">
        <circle cx="0" cy="-14" r="21" />
        <path d="M-19 -22c4-9 11-13 19-13s15 4 19 13" />
        <path d="M0 -35v13" />
        <path d="M-11 -24l-4 7" />
        <path d="M11 -24l4 7" />
        <circle cx="-8" cy="-12" r="1.7" fill="currentColor" />
        <circle cx="8" cy="-12" r="1.7" fill="currentColor" />
        <path d="M-3.5 -4q3.5 3.5 7 0" />
        <g transform="translate(-22,3) rotate(-16)"><Drill /></g>
        <g transform="translate(22,3) rotate(16)"><Drill /></g>
      </g>
    </svg>
  );
}

/** A baguette, because of course — the empty session list. */
export function DoodleBaguette() {
  return (
    <svg width="150" height="106" viewBox="0 0 150 106" fill="none" aria-hidden
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <g filter="url(#wobble)">
        <path d="M22 76c-6-7-3-16 7-19l82-27c10-3 18 1 20 8s-3 15-13 18l-82 27c-9 3-11 0-14-7z" />
        <path d="M45 60l9-9" />
        <path d="M62 54l9-9" />
        <path d="M79 48l9-9" />
        <path d="M96 42l9-9" />
        <path d="M31 71q4 3 8 1" strokeDasharray="1 5" />
      </g>
    </svg>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="page">{children}</div>;
}
