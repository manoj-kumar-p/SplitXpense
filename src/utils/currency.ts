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
 * Format paisa amount to display string with currency symbol.
 */
export function formatCurrency(paisa: number, currencyCode?: string): string {
  const amount = fromPaisa(paisa);
  const [whole, decimal] = amount.toFixed(2).split('.');
  const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (currencyCode) {
    const symbol = getCurrencySymbol(currencyCode);
    return `${symbol} ${formatted}.${decimal}`;
  }

  return `${formatted}.${decimal}`;
}
