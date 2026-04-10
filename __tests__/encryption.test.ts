/**
 * @jest-environment node
 */
// Polyfill global crypto.getRandomValues used by tweetnacl in a Node test env.
import {webcrypto} from 'crypto';
if (!(global as any).crypto) {
  (global as any).crypto = webcrypto;
}

import {encryptWithPassphrase, decryptWithPassphrase} from '../src/backup/encryption';

// scrypt at default cost (~16384) takes a few seconds in Node. Give Jest room.
jest.setTimeout(30000);

describe('backup encryption', () => {
  it('round-trips a plaintext through encrypt/decrypt', async () => {
    const plaintext = '{"hello":"world","number":42}';
    const passphrase = 'correct horse battery staple';
    const blob = await encryptWithPassphrase(plaintext, passphrase);
    expect(blob.ciphertext.length).toBeGreaterThan(0);
    expect(blob.nonce.length).toBeGreaterThan(0);
    expect(blob.salt.length).toBeGreaterThan(0);

    const recovered = await decryptWithPassphrase(blob, passphrase);
    expect(recovered).toBe(plaintext);
  });

  it('produces different ciphertext for the same input on each call', async () => {
    const plaintext = 'sensitive';
    const passphrase = 'a passphrase that works';
    const a = await encryptWithPassphrase(plaintext, passphrase);
    const b = await encryptWithPassphrase(plaintext, passphrase);
    // Salt and nonce should be random → ciphertext differs.
    expect(a.salt).not.toBe(b.salt);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('rejects the wrong passphrase', async () => {
    const blob = await encryptWithPassphrase('secret data', 'right passphrase');
    await expect(decryptWithPassphrase(blob, 'wrong passphrase')).rejects.toThrow(
      /wrong passphrase/i,
    );
  });

  it('rejects passphrases shorter than 8 characters', async () => {
    await expect(encryptWithPassphrase('data', 'short')).rejects.toThrow(
      /at least 8/i,
    );
  });

  it('handles unicode plaintext correctly', async () => {
    const plaintext = '日本語テスト 🎉 émoji';
    const passphrase = 'unicodepassphrase';
    const blob = await encryptWithPassphrase(plaintext, passphrase);
    const recovered = await decryptWithPassphrase(blob, passphrase);
    expect(recovered).toBe(plaintext);
  });
});
