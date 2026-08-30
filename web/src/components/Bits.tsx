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

/** Pearto — a tiny pear with a fringe and a small face. */
export function DoodlePearto() {
  return (
    <svg width="150" height="138" viewBox="-47 -62 94 92" fill="none" aria-hidden
         stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <g filter="url(#wobble)">
        <ellipse cx="0" cy="22" rx="35" ry="4" fill="currentColor" stroke="none" opacity=".12" />

        {/* pear body: narrow shoulders, round fruit at the bottom */}
        <path
          d="M-7-45c-15 2-17 17-19 28-2 12-15 21-15 34 0 18 18 27 41 27s41-9 41-27c0-13-13-22-15-34-2-11-4-26-19-28-5-1-9-1-14 0z"
          fill="var(--paper)"
        />
        <path d="M-3-45c-1-7 1-12 6-16 3 4 4 9 5 14" fill="var(--paper)" />
        <path d="M4-53c7-4 12-3 15 0-6 4-11 4-15 0z" fill="var(--paper)" />

        {/* fringe and ahoge curl borrowed into the pear's face */}
        <path d="M-22-14q5.5 7 11 0q5.5 7 11 0q5.5 7 11 0q5.5 7 11 0" />
        <path d="M-3-15c1-8 7-13 15-13-5 2-8 6-9 12" />
        <circle cx="-10" cy="-2" r="2" fill="currentColor" />
        <circle cx="10" cy="-2" r="2" fill="currentColor" />
        <path d="M-4 7q4 4 8 0" />
        <path d="M-18 4q-3 2-5 0M18 4q3 2 5 0" opacity=".45" />
      </g>
    </svg>
  );
}

/** A baguette, because of course — the empty session list. */
export function DoodleBaguette() {
  return (
    <svg width="150" height="106" viewBox="0 0 150 106" fill="none" aria-hidden
         className="doodle-baguette"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="75" cy="88" rx="47" ry="4" fill="currentColor" stroke="none" opacity=".13" />
      <g filter="url(#wobble)" transform="translate(0 -3)">
        <path d="M22 76c-6-7-3-16 7-19l82-27c10-3 18 1 20 8s-3 15-13 18l-82 27c-9 3-11 0-14-7z" fill="var(--paper)" />
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
