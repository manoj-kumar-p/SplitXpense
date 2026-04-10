import {getCurrencySymbol} from './currencies';

/**
 * Convert display amount (e.g. 450.50) to paisa integer (45050).
 */
export function toPaisa(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Convert paisa integer (45050) to display amount (450.50).
 */
export function fromPaisa(paisa: number): number {
  return paisa / 100;
}

/**
 * Format a whole-number string using the Indian numbering system
 * (e.g. 1234567 -> "12,34,567").
 */
function formatIndian(num: string): string {
  const len = num.length;
  if (len <= 3) return num;
  const last3 = num.slice(-3);
  const rest = num.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return grouped + ',' + last3;
}

/**
 * Format paisa amount to display string with currency symbol.
 */
export function formatCurrency(paisa: number, currencyCode?: string): string {
  const isNegative = paisa < 0;
  const absPaisa = Math.abs(paisa);
  const amount = fromPaisa(absPaisa);
  const [whole, decimal] = amount.toFixed(2).split('.');
  const sign = isNegative ? '-' : '';

  if (currencyCode) {
    const symbol = getCurrencySymbol(currencyCode);
    const formatted = currencyCode === 'INR' ? formatIndian(whole) : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${sign}${symbol} ${formatted}.${decimal}`;
  }

  // Default (no currency code) — use Indian format since INR is the app default
  const formatted = formatIndian(whole);
  return `${sign}${formatted}.${decimal}`;
}
