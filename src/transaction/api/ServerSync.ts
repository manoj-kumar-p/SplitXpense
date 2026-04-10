import {getSetting, setSetting} from '../../db/queries/settingsQueries';
import {getLocalUser} from '../../db/queries/userQueries';

/**
 * Build authorization headers for server API calls.
 * Includes Bearer token from settings if available.
 */
function getAuthHeaders(): Record<string, string> {
  const token = getSetting('server_auth_token');
  return token
    ? {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}
    : {'Content-Type': 'application/json'};
}

export interface ServerTransaction {
  id: string;
  phone: string;
  amount: number;
  currency: string;
  merchant: string;
  instrumentId: string;
  transactionType: 'debit' | 'credit';
  paymentMode: string;
  date: string;
  source: string;
  status: 'pending' | 'pushed' | 'dismissed';
}

/**
 * Get the configured server URL from app settings.
 */
function getServerUrl(): string {
  return getSetting('server_url') || '';
}

/**
 * Check whether the server URL has been configured.
 */
export function isServerConfigured(): boolean {
  const url = getServerUrl();
  return url.length > 0;
}

/**
 * Set the server URL in app settings.
 */
export function setServerUrl(url: string): void {
  setSetting('server_url', url);
}

/**
 * Register this device with the server.
 * Sends the phone number and FCM token for push notifications.
 */
export async function registerDevice(
  phone: string,
  fcmToken: string,
): Promise<void> {
  const baseUrl = getServerUrl();
  if (!baseUrl) throw new Error('Server URL not configured');

  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({phone, fcmToken}),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Device registration failed: ${body}`);
  }

  // Store auth token from registration response if provided
  try {
    const data = await response.clone().json();
    if (data.token) {
      setSetting('server_auth_token', data.token);
    }
  } catch {
    // Response may not be JSON - that's fine
  }
}

/**
 * Create an AA consent request via the server.
 * Returns a consent handle and redirect URL for the user to approve.
 */
export async function createAAConsent(
  phone: string,
  dateRange?: {from: string; to: string},
): Promise<{consentHandle: string; redirectUrl: string; consentId: string}> {
  const baseUrl = getServerUrl();
  if (!baseUrl) throw new Error('Server URL not configured');

  const range = dateRange || {
    from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
  };

  const response = await fetch(`${baseUrl}/api/aa/consent/create`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({phone, dateRange: range}),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Consent creation failed: ${body}`);
  }

  return response.json();
}

/**
 * Check the status of an AA consent request.
 * Returns: PENDING, APPROVED, REJECTED, REVOKED, or EXPIRED.
 */
export async function checkConsentStatus(consentId: string): Promise<string> {
  const baseUrl = getServerUrl();
  if (!baseUrl) throw new Error('Server URL not configured');

  const response = await fetch(`${baseUrl}/api/aa/consent/status`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({consentId}),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Consent status check failed: ${body}`);
  }

  const data = await response.json();
  return data.status;
}

/**
 * Trigger the server to fetch FI data using an approved consent.
 * The server will parse transactions and send push notifications.
 */
export async function triggerFIFetch(
  phone: string,
  consentId: string,
): Promise<void> {
  const baseUrl = getServerUrl();
  if (!baseUrl) throw new Error('Server URL not configured');

  const response = await fetch(`${baseUrl}/api/aa/fi/fetch`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({phone, consentId}),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`FI fetch failed: ${body}`);
  }
}

/**
 * Fetch pending transactions from the server.
 * These are transactions detected from AA bank statement data.
 * Automatically uses the local user's phone number.
 * Returns an empty array if the server is not configured or the request fails.
 */
export async function fetchServerTransactions(): Promise<ServerTransaction[]> {
  const baseUrl = getServerUrl();
  if (!baseUrl) return [];

  const user = getLocalUser();
  if (!user) return [];

  const response = await fetch(
    `${baseUrl}/api/transactions/pending?phone=${encodeURIComponent(user.phone_number)}`,
    {headers: getAuthHeaders()},
  );

  if (!response.ok) return [];

  const data = await response.json();
  return data.transactions || [];
}

/**
 * Dismiss a server-side pending transaction.
 */
export async function dismissServerTransaction(id: string): Promise<void> {
  const baseUrl = getServerUrl();
  if (!baseUrl) throw new Error('Server URL not configured');

  const response = await fetch(`${baseUrl}/api/transactions/dismiss/${id}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Dismiss transaction failed: ${body}`);
  }
}
