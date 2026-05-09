'use client';

import { useEffect } from 'react';
import { useBusinessStore } from '@/lib/store/business';
import { type Business, BUSINESS_COOKIE } from '@/lib/business';

type Props = {
  businesses: Business[];
  activeId: string;
  children: React.ReactNode;
};

export function BusinessProvider({ businesses, activeId, children }: Props) {
  const hydrate = useBusinessStore((s) => s.hydrate);

  useEffect(() => {
    hydrate(businesses, activeId);
    // Persist to cookie so next server render picks it up
    document.cookie = `${BUSINESS_COOKIE}=${activeId};path=/;max-age=${60 * 60 * 24 * 30};samesite=lax`;
  }, [businesses, activeId, hydrate]);

  return <>{children}</>;
}
