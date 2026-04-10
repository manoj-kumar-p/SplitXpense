import {toPaisa} from '../utils/currency';
import type {ParsedTransaction} from '../models/PendingTransaction';
import type {PaymentMode} from '../models/PendingTransaction';

// ---------------------------------------------------------------------------
// Amount patterns (tried in order, first match wins)
// ---------------------------------------------------------------------------

const AMOUNT_PATTERNS: RegExp[] = [
  // Rs.500, INR 1,234.56, ₹500
  /(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  // debited by Rs.500, credited Rs 200
  /(?:debited|credited)\s+(?:by\s+)?(?:rs\.?|inr|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  // Paid ₹500, Sent Rs.200, Received INR 300
  /(?:paid|sent|received)\s+(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
];

// ---------------------------------------------------------------------------
// Transaction type keywords
// ---------------------------------------------------------------------------

const DEBIT_KEYWORDS =
  /\b(?:debit(?:ed)?|spent|paid|sent|withdraw(?:n)?|purchase(?:d)?|used)\b/i;
const CREDIT_KEYWORDS =
  /\b(?:credit(?:ed)?|received|refund(?:ed)?|cashback)\b/i;

// ---------------------------------------------------------------------------
// Payment mode patterns
// ---------------------------------------------------------------------------

const PAYMENT_MODE_PATTERNS: {pattern: RegExp; mode: PaymentMode}[] = [
  {pattern: /\b(?:upi|upi\s*ref|upi\s*txn|google\s*pay|gpay|phonepe|paytm\s*upi|bhim)\b/i, mode: 'upi'},
  {pattern: /\bdebit\s*card\b/i, mode: 'debit_card'},
  {pattern: /\bcredit\s*card\b/i, mode: 'credit_card'},
  {pattern: /\b(?:neft|imps|net\s*banking|netbanking|rtgs)\b/i, mode: 'net_banking'},
  {pattern: /\b(?:wallet|paytm\s*wallet)\b/i, mode: 'wallet'},
];

// ---------------------------------------------------------------------------
// Instrument ID patterns
// ---------------------------------------------------------------------------

// Account last 4 digits: a/c XX1234, account ****1234, acct no. XX5678
const ACCOUNT_PATTERN =
  /(?:a\/?c|account|acct)[\s.:]*(?:no\.?\s*)?(?:xx|x|\*)*(\d{4})/i;

// Ending with pattern: ending 1234, ends with 5678
const ENDING_PATTERN = /(?:ending|ends?\s+with)\s*(\d{4})/i;

// Card last 4 digits: card XX1234, debit card ****5678
const CARD_PATTERN =
  /(?:card|debit\s*card|credit\s*card)[\s.:]*(?:no\.?\s*)?(?:xx|x|\*)*(\d{4})/i;

// UPI VPA: upi:user@bank, VPA user@ybl
const UPI_VPA_PATTERN = /(?:upi|vpa)[:\s]*([a-z0-9._-]+@[a-z]+)/i;

// ---------------------------------------------------------------------------
// Merchant extraction pattern
// ---------------------------------------------------------------------------

const MERCHANT_PATTERN =
  /(?:at|to|towards|for|info[:\s]+)\s*(?!VPA\b)([A-Za-z0-9][A-Za-z0-9\s&.'_-]{1,40}?)(?:\s+on\b|\s+ref\b|\s+upi\b|\s+avl\b|\s+bal\b|\s+via\b|\s+if\b|\.\s|$)/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize raw SMS / notification text for consistent parsing.
 */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Parse the first matching amount from text.
 * Returns the raw float value or null if no amount found.
 */
function extractAmount(text: string): number | null {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      const raw = match[1].replace(/,/g, '');
      const value = parseFloat(raw);
      if (!isNaN(value) && value > 0) {
        return value;
      }
    }
  }
  return null;
}

/**
 * Determine whether the transaction is a debit or credit.
 */
function detectTransactionType(text: string): 'debit' | 'credit' {
  const hasDebit = DEBIT_KEYWORDS.test(text);
  // Strip "credit card" before checking for credit keywords
  // to avoid misclassifying credit card purchases as credits
  const textWithoutCreditCard = text.replace(/credit\s*card/gi, '');
  const hasCredit = CREDIT_KEYWORDS.test(textWithoutCreditCard);

  if (hasCredit && !hasDebit) {
    return 'credit';
  }
  // Default to debit when ambiguous or both keywords present
  return 'debit';
}

/**
 * Detect payment mode from text.
 */
function detectPaymentMode(text: string): PaymentMode {
  for (const {pattern, mode} of PAYMENT_MODE_PATTERNS) {
    if (pattern.test(text)) {
      return mode;
    }
  }

  // Also check for a bare UPI transaction reference number pattern
  if (/\bupi\s*(?:ref|txn|id)[:\s]*\d+/i.test(text)) {
    return 'upi';
  }

  return '';
}

/**
 * Extract instrument identifier (card last4, account last4, or UPI VPA).
 */
function extractInstrumentId(text: string): string {
  // UPI VPA takes priority when payment mode is UPI-like
  const vpaMatch = UPI_VPA_PATTERN.exec(text);
  if (vpaMatch && vpaMatch[1]) {
    return vpaMatch[1].toLowerCase();
  }

  // Card last 4
  const cardMatch = CARD_PATTERN.exec(text);
  if (cardMatch && cardMatch[1]) {
    return cardMatch[1];
  }

  // Account last 4
  const accountMatch = ACCOUNT_PATTERN.exec(text);
  if (accountMatch && accountMatch[1]) {
    return accountMatch[1];
  }

  // Generic "ending XXXX"
  const endingMatch = ENDING_PATTERN.exec(text);
  if (endingMatch && endingMatch[1]) {
    return endingMatch[1];
  }

  return '';
}

/**
 * Extract merchant / payee name from text.
 */
function extractMerchant(text: string): string {
  const match = MERCHANT_PATTERN.exec(text);
  if (match && match[1]) {
    // Clean up: trim whitespace and trailing dots / dashes
    return match[1].replace(/[\s.\-]+$/, '').trim();
  }
  return '';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a bank SMS or UPI notification body into a structured transaction.
 * Returns null when the text cannot be recognised as a financial transaction.
 *
 * Covers major Indian banks (SBI, HDFC, ICICI, Axis, Kotak, BOB, PNB) and
 * UPI apps (GPay, PhonePe, Paytm).
 */
export function parseTransaction(text: string): ParsedTransaction | null {
  const normalized = normalize(text);

  // 1. Amount — mandatory
  const amountFloat = extractAmount(normalized);
  if (amountFloat === null) {
    return null;
  }

  const amountPaisa = toPaisa(amountFloat);

  // 2. Transaction type
  const transactionType = detectTransactionType(normalized);

  // 3. Payment mode
  const paymentMode = detectPaymentMode(normalized);

  // 4. Instrument ID
  const instrumentId = extractInstrumentId(normalized);

  // 5. Merchant
  const merchant = extractMerchant(normalized);

  return {
    amount: amountPaisa,
    currency: 'INR',
    merchant,
    paymentMode,
    instrumentId,
    transactionType,
  };
}

/**
 * Generate a deduplication key for a parsed transaction.
 *
 * Key structure: `{amountPaisa}_{timeSlot}`
 * where timeSlot groups detections into 5-minute windows (300 000 ms)
 * so that duplicate SMSes / notifications arriving close together
 * collapse into the same key.
 */
export function generateDedupKey(
  amountPaisa: number,
  detectedAt: string,
): string {
  const timeSlot = Math.floor(new Date(detectedAt).getTime() / 300000);
  return `${amountPaisa}_${timeSlot}`;
}
