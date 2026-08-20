export type Strength = 0 | 1 | 2;

/**
 * Weak / medium / strong, from length and character variety. Deliberately
 * simple: it guides the user, it does not gate them — the only hard rule is
 * the 8-character minimum, enforced by zod on the server.
 * Returns null for an empty field so nothing is shown before typing.
 */
export function scorePassword(password: string): Strength | null {
  if (!password) return null;

  const classes =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));

  if (password.length < 8 || classes <= 1) return 0;
  if (password.length >= 12 && classes >= 3) return 2;
  return 1;
}

export const STRENGTH_LABEL: Record<Strength, string> = {
  0: 'Weak',
  1: 'Medium',
  2: 'Strong',
};

export const STRENGTH_STYLE: Record<Strength, { bar: string; text: string }> = {
  0: { bar: 'bg-red-500', text: 'text-red-600' },
  1: { bar: 'bg-amber-500', text: 'text-amber-600' },
  2: { bar: 'bg-green-500', text: 'text-green-600' },
};
