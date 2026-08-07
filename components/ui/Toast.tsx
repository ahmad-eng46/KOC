'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

type ToastKind = 'success' | 'error';

type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

/**
 * Minimal toast host. Mounted once in AppShell.
 *
 * Deliberately tiny — the app had no notification primitive, and the supplier
 * flows need to confirm a purchase or payment landed without navigating away
 * from the modal's parent page.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      // Date.now() is only an id source here, never rendered.
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Bottom-centre on mobile so it clears the thumb zone, top-right on desktop */}
      <div
        role="status"
        aria-live="polite"
        className="fixed z-[60] inset-x-4 bottom-4 flex flex-col items-stretch gap-2
                   sm:inset-x-auto sm:bottom-auto sm:top-4 sm:right-4 sm:w-80 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              'flex items-start gap-2.5 w-full rounded-xl border px-3.5 py-3 shadow-lg',
              t.kind === 'success'
                ? 'bg-white border-green-200'
                : 'bg-white border-red-200',
            ].join(' ')}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 size={17} className="shrink-0 mt-0.5 text-green-600" />
            ) : (
              <AlertCircle size={17} className="shrink-0 mt-0.5 text-red-600" />
            )}
            <p className="flex-1 text-sm text-gray-800">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 -m-1.5 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Returns a no-op outside a ToastProvider rather than throwing, so a component
 * rendered in isolation (tests, storybook) still works.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? { showToast: () => {} };
}
