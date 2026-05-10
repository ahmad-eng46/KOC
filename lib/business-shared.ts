// Server-agnostic business types and constants.
// Safe to import from both client components and server modules.
// Server-only helpers (cookies/getActiveBusinessId) live in lib/business.ts.

export const BUSINESS_COOKIE = 'active_business_id';

export type Business = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
};
