import {parseTransaction} from '../TransactionParser';
import {toPaisa} from '../../utils/currency';
import type {ParsedTransaction} from '../../models/PendingTransaction';
import type {EmailMessage} from './GmailReader';

// ---------------------------------------------------------------------------
// Email-specific amount patterns
// ---------------------------------------------------------------------------

/**
 * Patterns commonly found in bank email subjects and bodies that carry
 * structured transaction data.  These supplement the SMS-oriented patterns
 * in TransactionParser.
 */
const EMAIL_AMOUNT_PATTERNS: RegExp[] = [
  // "Transaction Alert: INR 5,000 debited"
  /transaction\s+alert[:\s]*(?:inr|rs\.?|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  // "Amount: Rs. 500" or "Transaction Amount: INR 1,234.56"
  /(?:transaction\s+)?amount[:\s]*(?:inr|rs\.?|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  // "Amount Debited: 2500.00" (no currency prefix)
  /amount\s+(?:debited|credited)[:\s]*(?:inr|rs\.?|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  // "Total: Rs 1,500.00"
  /total[:\s]*(?:inr|rs\.?|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
];

// ---------------------------------------------------------------------------
// Email-specific field extractors
// ---------------------------------------------------------------------------

/**
 * Extract merchant from labelled fields in bank emails:
 *   "Merchant Name: Amazon"
 *   "Paid to: Swiggy"
 *   "Beneficiary: John Doe"
 */
const EMAIL_MERCHANT_PATTERNS: RegExp[] = [
  /merchant\s*(?:name)?[:\s]+([A-Za-z0-9][A-Za-z0-9\s&.'_-]{1,50}?)(?:\s*\n|\s*$|\s+(?:on|ref|card|amount|date))/i,
  /paid\s+to[:\s]+([A-Za-z0-9][A-Za-z0-9\s&.'_-]{1,50}?)(?:\s*\n|\s*$|\s+(?:on|ref|card|amount|date))/i,
  /beneficiary[:\s]+([A-Za-z0-9][A-Za-z0-9\s&.'_-]{1,50}?)(?:\s*\n|\s*$|\s+(?:on|ref|card|amount|date))/i,
  /payee[:\s]+([A-Za-z0-9][A-Za-z0-9\s&.'_-]{1,50}?)(?:\s*\n|\s*$|\s+(?:on|ref|card|amount|date))/i,
];

/**
 * Extract card / account number from labelled fields:
 *   "Card Number: XXXX XXXX XXXX 1234"
 *   "Account No: XX1234"
 */
const EMAIL_CARD_PATTERNS: RegExp[] = [
  /card\s*(?:number|no\.?)?[:\s]*(?:x|X|\*|\s)*(\d{4})\b/i,
  /(?:account|a\/c)\s*(?:number|no\.?)?[:\s]*(?:x|X|\*|\s)*(\d{4})\b/i,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a bank email into a structured transaction.
 *
 * Strategy:
 * 1. Concatenate subject + body and run through the main TransactionParser
 *    (which handles SMS / notification patterns).
 * 2. If the main parser fails, attempt email-specific extraction from the
 *    structured fields commonly found in bank emails.
 * 3. If we get a result from the main parser, try to enrich it with
 *    email-specific merchant / instrument data that the SMS parser may miss.
 *
 * Returns null when no transaction can be extracted.
 */
export function parseEmailTransaction(
  email: EmailMessage,
): ParsedTransaction | null {
  const combined = `${email.subject} ${email.body}`;

  // Try the main parser first (covers most SMS/notification patterns)
  const mainResult = parseTransaction(combined);

  if (mainResult) {
    // Enrich with email-specific fields if the main parser missed them
    if (!mainResult.merchant) {
      mainResult.merchant = extractEmailMerchant(combined);
    }
    if (!mainResult.instrumentId) {
      mainResult.instrumentId = extractEmailInstrumentId(combined);
    }
    return mainResult;
  }

  // Fall back to email-specific amount extraction
  const amount = extractEmailAmount(combined);
  if (amount === null || amount <= 0) {
    return null;
  }

  // Determine transaction type from the combined text
  const isCredit =
    /\b(?:credit(?:ed)?|received|refund(?:ed)?|cashback)\b/i.test(combined) &&
    !/\b(?:debit(?:ed)?|spent|paid|sent|withdraw(?:n)?|purchase(?:d)?)\b/i.test(
      combined,
    );

  const merchant = extractEmailMerchant(combined);
  const instrumentId = extractEmailInstrumentId(combined);

  // Detect payment mode
  let paymentMode = '' as ParsedTransaction['paymentMode'];
  if (/\b(?:upi|google\s*pay|gpay|phonepe|paytm\s*upi|bhim)\b/i.test(combined)) {
    paymentMode = 'upi';
  } else if (/\bdebit\s*card\b/i.test(combined)) {
    paymentMode = 'debit_card';
  } else if (/\bcredit\s*card\b/i.test(combined)) {
    paymentMode = 'credit_card';
  } else if (/\b(?:neft|imps|net\s*banking|rtgs)\b/i.test(combined)) {
    paymentMode = 'net_banking';
  }

  return {
    amount: toPaisa(amount),
    currency: 'INR',
    merchant,
    paymentMode,
    instrumentId,
    transactionType: isCredit ? 'credit' : 'debit',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractEmailAmount(text: string): number | null {
  for (const pattern of EMAIL_AMOUNT_PATTERNS) {
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

function extractEmailMerchant(text: string): string {
  for (const pattern of EMAIL_MERCHANT_PATTERNS) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      return match[1].replace(/[\s.\-]+$/, '').trim();
    }
  }
  return '';
}

function extractEmailInstrumentId(text: string): string {
  for (const pattern of EMAIL_CARD_PATTERNS) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      return match[1];
    }
  }
  return '';
}
