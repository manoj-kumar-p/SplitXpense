/**
 * Normalize a phone number to E.164 format.
 * If no country code prefix, assumes +91 (India).
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9+]/g, '');

  if (digits.startsWith('+')) {
    return digits;
  }

  if (digits.length === 10) {
    return '+91' + digits;
  }

  if (digits.startsWith('91') && digits.length === 12) {
    return '+' + digits;
  }

  return '+' + digits;
}

export function formatPhone(phone: string): string {
  if (phone.startsWith('+91') && phone.length === 13) {
    const num = phone.slice(3);
    return `+91 ${num.slice(0, 5)} ${num.slice(5)}`;
  }
  if (phone.startsWith('+1') && phone.length === 12) {
    const num = phone.slice(2);
    return `+1 (${num.slice(0, 3)}) ${num.slice(3, 6)}-${num.slice(6)}`;
  }
  if (phone.startsWith('+44') && phone.length === 13) {
    const num = phone.slice(3);
    return `+44 ${num.slice(0, 4)} ${num.slice(4)}`;
  }
  // Generic formatting: +CC XXXXXXX
  if (phone.startsWith('+')) {
    return phone;
  }
  return phone;
}

export function isValidPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return /^\+\d{10,15}$/.test(normalized);
}
