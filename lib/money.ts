export type Money = number; // always paisa (integer), never float

export function rupeesToPaisa(rupees: number): Money {
  return Math.round(rupees * 100);
}

export function paisaToRupees(paisa: Money): number {
  return paisa / 100;
}

export function formatPKR(paisa: Money, opts?: { showSymbol?: boolean }): string {
  const rupees = (paisa / 100).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
