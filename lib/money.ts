export type Money = number; // always paisa (integer), never float

export function rupeesToPaisa(rupees: number): Money {
  return Math.round(rupees * 100);
}

export function paisaToRupees(paisa: Money): number {
  return paisa / 100;
}

/**
 * Pakistani (lakh/crore) digit grouping: last three digits, then groups of
 * two — 1,50,000 not 150,000.
 *
 * Done by hand rather than toLocaleString: Node's and the browsers' ICU data
 * for 'en-PK' produce WESTERN grouping (150,000), so the locale route renders
 * the wrong system, and 'en-IN' output differs between JS engines. Manual
 * grouping is deterministic everywhere the same string is rendered (server
 * PDFs, client tables, Excel labels).
 */
function groupLakh(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  let rest = intDigits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return `${parts.join(',')},${last3}`;
}

export function formatPKR(paisa: Money, opts?: { showSymbol?: boolean }): string {
  const negative = paisa < 0;
  const abs = Math.abs(paisa);
  const rupeesInt = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  const rupees = `${negative ? '-' : ''}${groupLakh(String(rupeesInt))}.${fraction}`;
  return opts?.showSymbol === false ? rupees : `Rs. ${rupees}`;
}

export function parsePKR(input: string): Money {
  // Extract the first number-like pattern (handles "Rs. 500.50", "1,000", "500")
  const match = input.match(/[\d,]+(?:\.\d+)?/);
  if (!match) return 0;
  const val = parseFloat(match[0].replace(/,/g, ''));
  if (isNaN(val)) return 0;
  return rupeesToPaisa(val);
}

export function sumMoney(items: Money[]): Money {
  return items.reduce((a, b) => a + b, 0);
}

export function applyDiscount(amount: Money, discount: Money): Money {
  return Math.max(0, amount - discount);
}

export function applyDiscountPercent(amount: Money, percent: number): Money {
  return Math.round(amount * (1 - percent / 100));
}
