import { z } from 'zod';

/**
 * Canonical 8-4-4-4-12 hex UUID shape, WITHOUT enforcing RFC version/variant
 * bits. Zod v4's `.uuid()` is strict about those bits, which rejects the
 * synthetic ids used by our seed + legacy migration (e.g. the all-zero
 * `00000004-0000-0000-0000-000000000036` pattern). Postgres `uuid` columns
 * accept any hex in this shape, so our validators should too.
 */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const uuidLike = (message = 'Invalid id') =>
  z.string().regex(UUID_RE, message);
