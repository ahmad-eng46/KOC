'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Minimal viewport-aware dropdown, shared so every kebab/actions menu gets
 * the same fixes:
 *
 *  - The panel renders in a PORTAL with `position: fixed`, so it can never
 *    be clipped by an `overflow-hidden` ancestor (the table wrappers all
 *    have one — this is what cut the menu off for bottom rows).
 *  - After mount it measures itself and FLIPS above the trigger when there
 *    is not enough viewport space below, and clamps horizontally so a
 *    right-edge trigger on a 375px screen never pushes the panel off-screen.
 *  - It closes on outside pointer-down, Escape, scroll and resize — never
 *    on the trigger's blur. The old onBlur+setTimeout pattern unmounted the
 *    panel between mousedown and mouseup, so item onClick handlers never
 *    fired: blur happens at mousedown, click only at mouseup.
 *
 * Items call closeMenu() themselves via the render-prop, after their own
 * onClick has run.
 */

const VIEWPORT_GUTTER = 8;

type Position = { top: number; left: number; ready: boolean };

export function DropdownMenu({
  trigger,
  children,
  align = 'right',
  triggerLabel,
}: {
  /** Content of the trigger button (e.g. a kebab icon). */
  trigger: React.ReactNode;
  /** Panel content; receives close() so items can dismiss after acting. */
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'right';
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position>({ top: 0, left: 0, ready: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  // Position after the panel exists so its real size can be measured.
  useLayoutEffect(() => {
    if (!open) return;
    const triggerEl = triggerRef.current;
    const panelEl = panelRef.current;
    if (!triggerEl || !panelEl) return;

    const rect = triggerEl.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = panelEl;

    const fitsBelow = rect.bottom + 4 + h <= window.innerHeight - VIEWPORT_GUTTER;
    const fitsAbove = rect.top - 4 - h >= VIEWPORT_GUTTER;
    // Prefer below; flip above when below clips and above fits (or clips less).
    const top = fitsBelow || !fitsAbove ? rect.bottom + 4 : rect.top - 4 - h;

    const rawLeft = align === 'right' ? rect.right - w : rect.left;
    const left = Math.min(
      Math.max(rawLeft, VIEWPORT_GUTTER),
      window.innerWidth - w - VIEWPORT_GUTTER,
    );

    setPos({ top, left, ready: true });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent | TouchEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // The panel is fixed-position: scrolling moves its anchor away, so close.
    function onScrollOrResize() {
      setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => {
          setPos((p) => ({ ...p, ready: false }));
          setOpen((v) => !v);
        }}
        className="p-2.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
      >
        {trigger}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              // Invisible during the measure pass to avoid a one-frame jump.
              visibility: pos.ready ? 'visible' : 'hidden',
            }}
            className="w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1"
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}

export function DropdownMenuItem({
  icon: Icon, onClick, close, children, disabled, danger, hint,
}: {
  icon: React.ElementType;
  onClick: () => void;
  /** Provided by DropdownMenu's render prop. */
  close: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onClick();
        close();
      }}
      disabled={disabled}
      title={hint}
      className={[
        // min-h-11 = 44px tap target
        'w-full flex items-center gap-2 px-3 py-2.5 min-h-11 text-left text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed',
        danger ? 'text-red-600' : 'text-gray-700',
      ].join(' ')}
    >
      <Icon size={14} />
      {children}
    </button>
  );
}
