import fetch from 'node-fetch';
import {cacheToken, getCachedToken} from '../db/redis';

export interface ConsentResponse {
  consentId: string;
  consentHandle: string;
  redirectUrl: string;
}

export interface ConsentStatus {
  consentId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'EXPIRED';
}

export interface SessionResponse {
  sessionId: string;
  consentId: string;
  status: string;
}

export interface FITransaction {
  txnId: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  narration: string;
  transactionTimestamp: string;
  reference: string;
}

export interface FIAccount {
  accountType: string;
  maskedAccountNumber: string;
  transactions: FITransaction[];
}

export interface FIData {
  accounts: FIAccount[];
}

/**
 * Setu Account Aggregator API client.
 * Handles authentication, consent management, and FI data fetching.
 * Reference: https://docs.setu.co/data/account-aggregator
 */
export class SetuAAClient {
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.baseUrl = process.env.SETU_AA_BASE_URL || 'https://fiu-uat.setu.co';
    this.clientId = process.env.SETU_AA_CLIENT_ID || '';
    this.clientSecret = process.env.SETU_AA_CLIENT_SECRET || '';
  }

  /**
   * Get a valid access token, refreshing if expired.
   * Uses Redis cache to share tokens across server restarts / instances.
   */
  async getAccessToken(): Promise<string> {
    // Check Redis cache first
    const cached = await getCachedToken('setu_aa_token');
    if (cached) {
      return cached;
    }

    // Fall back to in-memory cache
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const response = await fetch(`${this.baseUrl}/v2/token`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        clientID: this.clientId,
        secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Token fetch failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {access_token: string; expires_in: number};
    this.accessToken = data.access_token;
    // Expire 60s early to avoid edge cases
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

    // Cache in Redis (tokens usually expire in 1800s, cache for 1700)
    await cacheToken('setu_aa_token', this.accessToken, 1700);

    return this.accessToken;
  }

  /**
   * Create a consent request for the user to approve in their AA app.
   * Requests DEPOSIT (savings account) FI type with TRANSACTIONS data range.
   */
  async createConsent(
    phoneNumber: string,
    dateRange: {from: string; to: string},
  ): Promise<ConsentResponse> {
    const token = await this.getAccessToken();

    // Strip country code prefix for the AA VUA (Virtual User Address)
    // Setu expects phone@aa-provider format
    const digits = phoneNumber.replace(/[^0-9]/g, '');
    const last10 = digits.slice(-10);

    const consentBody = {
      consentDuration: {
        unit: 'MONTH',
        value: 6,
      },
      Customer: {
        id: `${last10}@onemoney`,
      },
      FIDataRange: {
        from: dateRange.from,
        to: dateRange.to,
      },
      consentMode: 'VIEW',
      consentTypes: ['TRANSACTIONS'],
      fetchType: 'PERIODIC',
      Frequency: {
        unit: 'DAY',
        value: 1,
      },
      FITypes: ['DEPOSIT'],
      DataLife: {
        unit: 'DAY',
        value: 1,
      },
      Purpose: {
        code: '101',
        refUri: 'https://api.rebit.org.in/aa/purpose/101.xml',
        text: 'Personal Finance Management',
        Category: {
          type: 'string',
        },
      },
      redirectUrl: `splitxpense://aa/callback`,
    };

    const response = await fetch(`${this.baseUrl}/v2/consents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-product-instance-id': this.clientId,
      },
      body: JSON.stringify(consentBody),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Consent creation failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      id: string;
      url: string;
      status: string;
    };

    return {
      consentId: data.id,
      consentHandle: data.id,
      redirectUrl: data.url,
    };
  }

  /**
   * Check the status of a consent request.
   */
  async getConsentStatus(consentId: string): Promise<ConsentStatus> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.baseUrl}/v2/consents/${consentId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-product-instance-id': this.clientId,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Consent status check failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      id: string;
      status: string;
    };

    return {
      consentId: data.id,
      status: data.status as ConsentStatus['status'],
    };
  }

  /**
   * Create a Financial Information data session using an approved consent.
   */
  async createFISession(consentId: string): Promise<SessionResponse> {
    const token = await this.getAccessToken();

    const sessionBody = {
      consentId,
      DataRange: {
        from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
      },
      format: 'json',
    };

    const response = await fetch(`${this.baseUrl}/v2/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-product-instance-id': this.clientId,
      },
      body: JSON.stringify(sessionBody),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`FI session creation failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      id: string;
      consentId: string;
      status: string;
    };

    return {
      sessionId: data.id,
      consentId: data.consentId,
      status: data.status,
    };
  }

  /**
   * Fetch the decrypted financial data from an FI session.
   * Parses the response into a structured FIData with accounts and transactions.
   */
  async fetchFIData(sessionId: string): Promise<FIData> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.baseUrl}/v2/sessions/${sessionId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-product-instance-id': this.clientId,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`FI data fetch failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      status: string;
      Payload: Array<{
        data: Array<{
          decryptedFI: {
            account: {
              type: string;
              maskedAccNumber: string;
              summary: {
                Transactions: {
                  Transaction: Array<{
                    txnId: string;
                    type: string;
                    amount: number;
                    narration: string;
                    transactionTimestamp: string;
                    reference: string;
                  }>;
                };
              };
            };
          };
        }>;
      }>;
    };

    const accounts: FIAccount[] = [];

    if (data.Payload) {
      for (const payload of data.Payload) {
        for (const fi of payload.data) {
          const acct = fi.decryptedFI?.account;
          if (!acct) continue;

          const rawTxns = acct.summary?.Transactions?.Transaction || [];
          const transactions: FITransaction[] = rawTxns.map(txn => ({
            txnId: txn.txnId,
            type: txn.type === 'DEBIT' ? 'DEBIT' : 'CREDIT',
            // Setu returns amount as a number in rupees; convert to paisa (integer)
            amount: Math.round(txn.amount * 100),
            narration: txn.narration,
            transactionTimestamp: txn.transactionTimestamp,
            reference: txn.reference,
          }));

          accounts.push({
            accountType: acct.type,
            maskedAccountNumber: acct.maskedAccNumber,
            transactions,
          });
        }
      }
    }

    return {accounts};
  }
}
