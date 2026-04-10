/**
 * Backup encryption — passphrase-based, server-blind.
 *
 * Uses tweetnacl secretbox (XSalsa20 + Poly1305) for authenticated encryption,
 * and scrypt for password-based key derivation. The server only ever sees
 * ciphertext + nonce + salt + KDF parameters; it cannot decrypt without the
 * user's passphrase.
 */
import 'react-native-get-random-values';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import {scrypt} from 'scrypt-js';

export interface KdfParams {
  N: number;
  r: number;
  p: number;
  dkLen: number;
}

// scrypt cost factors tuned for mobile: ~1-2 seconds on a mid-range Android.
export const DEFAULT_KDF_PARAMS: KdfParams = {
  N: 16384,
  r: 8,
  p: 1,
  dkLen: 32,
};

export interface EncryptedBlob {
  ciphertext: string; // base64
  nonce: string; // base64
  salt: string; // base64
  kdfParams: KdfParams;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<Uint8Array> {
  const pwBytes = naclUtil.decodeUTF8(passphrase.normalize('NFKC'));
  const key = await scrypt(pwBytes, salt, params.N, params.r, params.p, params.dkLen);
  return new Uint8Array(key);
}

/**
 * Encrypt a UTF-8 plaintext string with a user passphrase.
 * Generates a fresh random salt and nonce on every call.
 */
export async function encryptWithPassphrase(
  plaintext: string,
  passphrase: string,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<EncryptedBlob> {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters');
  }
  const salt = nacl.randomBytes(16);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength); // 24 bytes
  const key = await deriveKey(passphrase, salt, params);
  const message = naclUtil.decodeUTF8(plaintext);
  const ciphertext = nacl.secretbox(message, nonce, key);
  return {
    ciphertext: naclUtil.encodeBase64(ciphertext),
    nonce: naclUtil.encodeBase64(nonce),
    salt: naclUtil.encodeBase64(salt),
    kdfParams: params,
  };
}

/**
 * Decrypt a blob produced by encryptWithPassphrase.
 * Throws if the passphrase is wrong or the ciphertext is tampered.
 */
export async function decryptWithPassphrase(
  blob: EncryptedBlob,
  passphrase: string,
): Promise<string> {
  const salt = naclUtil.decodeBase64(blob.salt);
  const nonce = naclUtil.decodeBase64(blob.nonce);
  const ciphertext = naclUtil.decodeBase64(blob.ciphertext);
  const key = await deriveKey(passphrase, salt, blob.kdfParams);
  const plaintext = nacl.secretbox.open(ciphertext, nonce, key);
  if (!plaintext) {
    throw new Error('Decryption failed — wrong passphrase or corrupt backup');
  }
  return naclUtil.encodeUTF8(plaintext);
}
