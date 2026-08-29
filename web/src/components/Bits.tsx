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

/** A stack of paper with a pen resting on it — the empty session list. */
export function DoodleDesk() {
  return (
    <svg width="150" height="118" viewBox="0 0 150 118" fill="none" aria-hidden
         stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <g filter="url(#wobble)" opacity="0.85">
        <path d="M28 40h74l14 14v50a5 5 0 0 1-5 5H33a5 5 0 0 1-5-5V45a5 5 0 0 1 5-5z" />
        <path d="M102 40v14h14" />
        <path d="M44 70h48M44 82h34" strokeDasharray="1 6" />
        <path d="M20 30h70" opacity="0.5" />
        <path d="M112 22l14 14-38 38-18 4 4-18z" />
        <path d="M108 26l14 14" />
      </g>
    </svg>
  );
}

/** A small friendly terminal creature — the login screen. */
export function DoodleBox() {
  return (
    <svg width="118" height="104" viewBox="0 0 118 104" fill="none" aria-hidden
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <g filter="url(#wobble)">
        <rect x="17" y="24" width="84" height="62" rx="9" />
        <path d="M32 46l10 9-10 9" />
        <path d="M56 64h18" />
        <circle cx="41" cy="14" r="4.5" />
        <path d="M41 19v5" />
        <path d="M77 14l6 6M83 14l-6 6" />
        <path d="M34 86v9M84 86v9" />
        <path d="M26 95h16M76 95h16" />
      </g>
    </svg>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="page">{children}</div>;
}
