'use client';

import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * Whether a form on screen has edits the user has not saved.
 *
 * A store rather than context because the two ends are far apart: the form is
 * deep inside the page, the back button is in the app shell above it, and
 * threading a prop between them would mean every page in the app passing it
 * through. There is only ever one form being edited at a time, so one flag is
 * enough.
 */
type UnsavedStore = {
  dirtyCount: number;
  markDirty: () => void;
  markClean: () => void;
};

const useUnsavedStore = create<UnsavedStore>((set) => ({
  dirtyCount: 0,
  markDirty: () => set((s) => (s.dirtyCount > 0 ? s : { dirtyCount: 1 })),
  markClean: () => set({ dirtyCount: 0 }),
}));

export function useHasUnsavedChanges(): boolean {
  return useUnsavedStore((s) => s.dirtyCount > 0);
}

/**
 * Declare that this form has unsaved edits. Call it with react-hook-form's
 * `formState.isDirty`, or any equivalent.
 *
 *   useUnsavedChanges(formState.isDirty && !isSubmitting);
 *
 * Clears itself on unmount, so navigating away by any route — including a
 * successful submit that redirects — leaves the flag down. Also installs the
 * browser's own "leave site?" prompt, which covers a closed tab or a typed
 * URL, neither of which the back button can intercept.
 */
export function useUnsavedChanges(isDirty: boolean): void {
  useEffect(() => {
    const { markDirty, markClean } = useUnsavedStore.getState();
    if (isDirty) markDirty();
    else markClean();
  }, [isDirty]);

  useEffect(() => () => useUnsavedStore.getState().markClean(), []);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Browsers ignore the text and show their own wording; assigning
      // returnValue is still what triggers the prompt at all.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);
}
