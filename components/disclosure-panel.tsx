import type { ReactNode } from 'react';

/** Keeps disclosure state during short CSS transitions; closed controls are never focusable. */
export function DisclosurePanel({ open, id, children, className = '' }: {
  open: boolean;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div id={id} data-open={open} aria-hidden={!open} inert={!open} className={`sb-motion-disclosure ${className}`}>
      <div className="sb-motion-disclosure-inner">{children}</div>
    </div>
  );
}
