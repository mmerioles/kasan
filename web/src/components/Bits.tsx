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
      {status === 'idle' ? (
        <path className="done-check" d="M1.7 6.2 4.7 9 10.4 2.7" />
      ) : (
        <circle cx="6" cy="6" r="4.4" />
      )}
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

/**
 * One twin-drill: a short, fat, tapering coil. Proportions follow the official
 * TWINDRILL character art — the drills hang from temple height, not the jaw,
 * and reach only to about the chin. Coils are filled with the paper colour so
 * they stack opaquely instead of turning into a thicket of lines.
 */
function Drill() {
  return (
    <g>
      <path d="M-10.5 0 -4.2 31.7" />
      <path d="M10.5 0 4.2 31.7" />
      <path d="M-4.2 31.7q4.2 4 8.5 0" />
      <ellipse cx="0" cy="24.4" rx="6" ry="2.6" fill="var(--paper)" />
      <ellipse cx="0" cy="16.7" rx="7.2" ry="3.2" fill="var(--paper)" />
      <ellipse cx="0" cy="8.6" rx="8.7" ry="3.8" fill="var(--paper)" />
      <ellipse cx="0" cy="0" rx="10.5" ry="4.6" fill="var(--paper)" />
    </g>
  );
}

/** Teto — twin drills, thick bangs, and the ahoge. The login screen. */
export function DoodleTeto() {
  return (
    <svg width="150" height="128" viewBox="-41 -52 82 70" fill="none" aria-hidden
         stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <g filter="url(#wobble)">
        {/* drills first, so the head paints over where they tuck behind it */}
        <g transform="translate(-27,-20) rotate(-16)"><Drill /></g>
        <g transform="translate(27,-20) rotate(16)"><Drill /></g>

        <circle cx="0" cy="-14" r="21" fill="var(--paper)" />
        {/* thick scalloped bangs */}
        <path d="M-19 -21q4.75 7 9.5 0q4.75 7 9.5 0q4.75 7 9.5 0q4.75 7 9.5 0" />
        {/* ahoge */}
        <path d="M0 -34c-1-6 2-11 7-13" />
        <path d="M7 -47c3 2 2 6-1 7" />
        <circle cx="-8" cy="-11" r="1.9" fill="currentColor" />
        <circle cx="8" cy="-11" r="1.9" fill="currentColor" />
        <path d="M-3.5 -3q3.5 3.5 7 0" />
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
