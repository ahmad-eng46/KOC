'use client';

import { create } from 'zustand';
import { type Business } from '@/lib/business';

type BusinessStore = {
  activeId: string | null;
  businesses: Business[];
  setActive: (id: string) => void;
  hydrate: (businesses: Business[], activeId: string) => void;
};

export const useBusinessStore = create<BusinessStore>((set) => ({
  activeId: null,
  businesses: [],
  setActive: (id) => set({ activeId: id }),
  hydrate: (businesses, activeId) => set({ businesses, activeId }),
}));

// Convenience selector
export function useActiveBusiness(): Business | null {
  return useBusinessStore((s) =>
    s.businesses.find((b) => b.id === s.activeId) ?? null,
  );
}
