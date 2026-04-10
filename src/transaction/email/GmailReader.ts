import {getAccessToken} from './GmailAuth';
import {getSetting, setSetting} from '../../db/queries/settingsQueries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  body: string; // plain text extracted from email
  date: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const KEY_LAST_CHECK = 'gmail_last_check';

/**
 * Gmail search query targeting major Indian bank senders and transaction keywords.
 * Uses `newer_than:1d` so we only look at recent emails.
 */
const BANK_QUERY =
  'from:(sbi OR hdfc OR icici OR axis OR kotak OR bob OR pnb OR canara OR union OR yesbank OR indusind OR federal OR rbl) ' +
  'subject:(transaction OR debit OR credit OR statement OR alert OR payment) ' +
  'newer_than:1d';

const MAX_RESULTS = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Base64url decode (Gmail uses URL-safe base64 without padding).
 */
function base64UrlDecode(data: string): string {
  // Replace URL-safe chars with standard base64 chars
  let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  // atob is available in React Native's JavaScriptCore / Hermes
  try {
    return atob(base64);
  } catch {
    return '';
  }
}

/**
 * Strip HTML tags and decode basic HTML entities to produce plain text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract a header value from the Gmail message headers array.
 */
function getHeader(
  headers: Array<{name: string; value: string}>,
  name: string,
): string {
  const header = headers.find(
    h => h.name.toLowerCase() === name.toLowerCase(),
  );
  return header?.value || '';
}

/**
 * Recursively extract plain text or HTML body from MIME parts.
 */
function extractBody(payload: any): string {
  // If the payload itself has a body with data
  if (payload.body?.data) {
    const decoded = base64UrlDecode(payload.body.data);
    if (payload.mimeType === 'text/plain') {
      return decoded;
    }
    if (payload.mimeType === 'text/html') {
      return stripHtml(decoded);
    }
    return decoded;
  }

  // Walk through parts
  if (payload.parts && payload.parts.length > 0) {
    // Prefer text/plain
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return base64UrlDecode(part.body.data);
      }
    }
    // Fall back to text/html
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return stripHtml(base64UrlDecode(part.body.data));
      }
    }
    // Recurse into nested multipart parts
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) {
          return nested;
        }
      }
    }
  }

  return '';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch recent bank transaction emails from Gmail.
 *
 * Returns an array of simplified email messages with plain-text bodies.
 * Only fetches emails newer than the last check timestamp.
 */
export async function fetchRecentBankEmails(): Promise<EmailMessage[]> {
  const token = await getAccessToken();

  // Build query — optionally restrict to emails after last check
  let query = BANK_QUERY;
  const lastCheck = getSetting(KEY_LAST_CHECK);
  if (lastCheck) {
    // Gmail `after:` uses epoch seconds
    const epochSec = Math.floor(parseInt(lastCheck, 10) / 1000);
    query += ` after:${epochSec}`;
  }

  // 1. List message IDs matching query
  const listUrl = `${GMAIL_API}/messages?${new URLSearchParams({
    q: query,
    maxResults: String(MAX_RESULTS),
  }).toString()}`;

  const listRes = await fetch(listUrl, {
    headers: {Authorization: `Bearer ${token}`},
  });

  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(`Gmail list failed (${listRes.status}): ${errText}`);
  }

  const listData = await listRes.json();
  const messageIds: string[] = (listData.messages || []).map(
    (m: {id: string}) => m.id,
  );

  if (messageIds.length === 0) {
    return [];
  }

  // 2. Fetch each message in full
  const emails: EmailMessage[] = [];

  for (const msgId of messageIds) {
    try {
      const msgUrl = `${GMAIL_API}/messages/${msgId}?format=full`;
      const msgRes = await fetch(msgUrl, {
        headers: {Authorization: `Bearer ${token}`},
      });

      if (!msgRes.ok) {
        continue;
      }

      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      const from = getHeader(headers, 'From');
      const subject = getHeader(headers, 'Subject');
      const date = getHeader(headers, 'Date');
      const body = extractBody(msgData.payload);

      if (body) {
        emails.push({
          id: msgId,
          from,
          subject,
          body,
          date,
        });
      }
    } catch {
      // Skip individual message failures and continue with the rest
      continue;
    }
  }

  return emails;
}

/**
 * Update the last-check timestamp to now.
 */
export function updateLastCheckTimestamp(): void {
  setSetting(KEY_LAST_CHECK, String(Date.now()));
}
