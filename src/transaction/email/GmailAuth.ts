// TODO: Migrate to react-native-keychain for secure token storage
// Current implementation stores tokens in app_settings (plaintext SQLite)
// OAuth tokens (access_token, refresh_token) should be stored in the
// Android Keystore / iOS Keychain for production use.

import {Linking} from 'react-native';
import {getSetting, setSetting} from '../../db/queries/settingsQueries';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const REDIRECT_URI = 'splitxpense://gmail-callback';

// Settings keys
const KEY_ACCESS_TOKEN = 'gmail_access_token';
const KEY_REFRESH_TOKEN = 'gmail_refresh_token';
const KEY_TOKEN_EXPIRY = 'gmail_token_expiry';
const KEY_CLIENT_ID = 'gmail_client_id';
const KEY_CLIENT_SECRET = 'gmail_client_secret';

// ---------------------------------------------------------------------------
// Client credentials helpers
// ---------------------------------------------------------------------------

/**
 * Get the configured OAuth client ID.
 * User must set this in profile settings before connecting Gmail.
 */
export function getClientId(): string {
  return getSetting(KEY_CLIENT_ID) || '';
}

export function setClientId(clientId: string): void {
  setSetting(KEY_CLIENT_ID, clientId.trim());
}

export function getClientSecret(): string {
  return getSetting(KEY_CLIENT_SECRET) || '';
}

export function setClientSecret(secret: string): void {
  setSetting(KEY_CLIENT_SECRET, secret.trim());
}

// ---------------------------------------------------------------------------
// Connection status
// ---------------------------------------------------------------------------

/**
 * Check if Gmail tokens exist (i.e. user has connected Gmail).
 */
export function isGmailConnected(): boolean {
  const accessToken = getSetting(KEY_ACCESS_TOKEN);
  const refreshToken = getSetting(KEY_REFRESH_TOKEN);
  return !!(accessToken && refreshToken);
}

// ---------------------------------------------------------------------------
// OAuth flow
// ---------------------------------------------------------------------------

/**
 * Open the browser for Google OAuth consent.
 * The user will be redirected back to `splitxpense://gmail-callback?code=...`
 */
export function initiateGmailAuth(): void {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error(
      'Gmail Client ID not configured. Set it in Profile > Connect Gmail settings.',
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });

  const url = `${AUTH_ENDPOINT}?${params.toString()}`;
  Linking.openURL(url);
}

/**
 * Exchange the authorization code received from the OAuth callback for
 * access and refresh tokens.
 */
export async function handleAuthCallback(code: string): Promise<void> {
  const clientId = getClientId();
  const clientSecret = getClientSecret();

  if (!clientId) {
    throw new Error('Gmail Client ID not configured.');
  }

  const body: Record<string, string> = {
    code,
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  };

  // Client secret is optional for mobile apps using PKCE, but required for
  // standard OAuth web-app clients.
  if (clientSecret) {
    body.client_secret = clientSecret;
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Token exchange failed: ${errText}`);
  }

  const data = await response.json();

  // Persist tokens
  setSetting(KEY_ACCESS_TOKEN, data.access_token);
  if (data.refresh_token) {
    setSetting(KEY_REFRESH_TOKEN, data.refresh_token);
  }
  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  setSetting(KEY_TOKEN_EXPIRY, String(expiresAt));
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

/** Lock to prevent concurrent token refreshes. */
let refreshPromise: Promise<string> | null = null;

/**
 * Perform the actual token refresh against Google's token endpoint.
 */
async function doRefresh(): Promise<string> {
  const refreshToken = getSetting(KEY_REFRESH_TOKEN);
  const clientId = getClientId();
  const clientSecret = getClientSecret();

  const body: Record<string, string> = {
    refresh_token: refreshToken!,
    client_id: clientId,
    grant_type: 'refresh_token',
  };

  if (clientSecret) {
    body.client_secret = clientSecret;
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    // If refresh fails, clear tokens so user can re-connect
    disconnectGmail();
    throw new Error(`Token refresh failed: ${errText}`);
  }

  const data = await response.json();

  setSetting(KEY_ACCESS_TOKEN, data.access_token);
  const newExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  setSetting(KEY_TOKEN_EXPIRY, String(newExpiry));

  // Google may rotate the refresh token
  if (data.refresh_token) {
    setSetting(KEY_REFRESH_TOKEN, data.refresh_token);
  }

  return data.access_token;
}

/**
 * Return a valid access token, refreshing automatically if expired.
 * Uses a promise-based lock to prevent concurrent refresh requests.
 */
export async function getAccessToken(): Promise<string> {
  const accessToken = getSetting(KEY_ACCESS_TOKEN);
  const refreshToken = getSetting(KEY_REFRESH_TOKEN);
  const expiryStr = getSetting(KEY_TOKEN_EXPIRY);

  if (!accessToken || !refreshToken) {
    throw new Error('Gmail not connected. Please connect Gmail first.');
  }

  // Check if token is still valid (with 60-second buffer)
  const expiry = expiryStr ? parseInt(expiryStr, 10) : 0;
  if (Date.now() < expiry - 60_000) {
    return accessToken;
  }

  // Token expired — refresh with lock to prevent concurrent refreshes
  if (refreshPromise) return refreshPromise;
  refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

/**
 * Clear all Gmail tokens from settings (disconnect).
 */
export function disconnectGmail(): void {
  setSetting(KEY_ACCESS_TOKEN, '');
  setSetting(KEY_REFRESH_TOKEN, '');
  setSetting(KEY_TOKEN_EXPIRY, '');
}
