import {Router, Request, Response} from 'express';
import express from 'express';
import {getPool} from '../db/postgres';
import {isRateLimited} from '../db/redis';
import {maskPhone} from '../utils/mask';

export const backupRouter = Router();

// 25 MB max — backups are JSON dumps of the user's local DB.
const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
backupRouter.use(express.json({limit: '25mb'}));

interface UploadBody {
  ciphertext: string; // base64
  nonce: string; // base64
  salt: string; // base64
  kdfParams: {N: number; r: number; p: number; dkLen: number};
  formatVersion?: number;
}

function decodeBase64(b64: string, field: string): Buffer {
  if (typeof b64 !== 'string' || b64.length === 0) {
    throw new Error(`${field} must be a non-empty base64 string`);
  }
  const buf = Buffer.from(b64, 'base64');
  if (buf.length === 0) throw new Error(`${field} decoded to empty buffer`);
  return buf;
}

/**
 * POST /api/backup/upload
 * Store an encrypted backup blob for the authenticated phone.
 * The server never sees plaintext: it only stores the ciphertext, nonce, salt,
 * and KDF parameters needed for the client to decrypt later.
 */
backupRouter.post('/upload', async (req: Request, res: Response) => {
  try {
    const phone = req.phone!;
    const body = req.body as UploadBody;

    if (!body || typeof body !== 'object') {
      return res.status(400).json({error: 'Body must be JSON object'});
    }

    let ciphertext: Buffer, nonce: Buffer, salt: Buffer;
    try {
      ciphertext = decodeBase64(body.ciphertext, 'ciphertext');
      nonce = decodeBase64(body.nonce, 'nonce');
      salt = decodeBase64(body.salt, 'salt');
    } catch (err) {
      return res.status(400).json({error: (err as Error).message});
    }

    if (ciphertext.length > MAX_BACKUP_BYTES) {
      return res.status(413).json({error: 'Backup too large'});
    }
    if (nonce.length !== 24) {
      return res.status(400).json({error: 'nonce must be 24 bytes'});
    }
    if (salt.length < 16) {
      return res.status(400).json({error: 'salt must be at least 16 bytes'});
    }
    if (!body.kdfParams || typeof body.kdfParams !== 'object') {
      return res.status(400).json({error: 'kdfParams required'});
    }
    const {N, r, p, dkLen} = body.kdfParams;
    if (![N, r, p, dkLen].every(v => typeof v === 'number' && v > 0)) {
      return res.status(400).json({error: 'kdfParams fields must be positive numbers'});
    }

    // Rate limit: 10 uploads per hour per phone (avoid abuse)
    if (await isRateLimited(`rl:backup:up:${phone}`, 10, 3600)) {
      return res.status(429).json({error: 'Too many backup uploads. Try again later.'});
    }

    await getPool().query(
      `INSERT INTO device_backups
         (phone, ciphertext, nonce, salt, kdf_params, format_version, size_bytes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (phone) DO UPDATE SET
         ciphertext = $2,
         nonce = $3,
         salt = $4,
         kdf_params = $5,
         format_version = $6,
         size_bytes = $7,
         updated_at = NOW()`,
      [
        phone,
        ciphertext,
        nonce,
        salt,
        JSON.stringify(body.kdfParams),
        body.formatVersion || 1,
        ciphertext.length,
      ],
    );

    console.log(`Backup uploaded: ${maskPhone(phone)} (${ciphertext.length} bytes)`);
    return res.json({success: true, sizeBytes: ciphertext.length});
  } catch (err) {
    console.error('Backup upload failed:', err);
    return res.status(500).json({error: 'Internal server error'});
  }
});

/**
 * GET /api/backup/info
 * Returns metadata about the stored backup (no ciphertext).
 * Used by the client to show "last backup at X" and decide whether to restore.
 */
backupRouter.get('/info', async (req: Request, res: Response) => {
  try {
    const phone = req.phone!;
    const result = await getPool().query(
      `SELECT format_version, size_bytes, created_at, updated_at
       FROM device_backups WHERE phone = $1`,
      [phone],
    );
    if (result.rowCount === 0) return res.json({exists: false});
    const row = result.rows[0];
    return res.json({
      exists: true,
      formatVersion: row.format_version,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('Backup info failed:', err);
    return res.status(500).json({error: 'Internal server error'});
  }
});

/**
 * GET /api/backup/download
 * Returns the encrypted blob for the authenticated phone.
 */
backupRouter.get('/download', async (req: Request, res: Response) => {
  try {
    const phone = req.phone!;

    if (await isRateLimited(`rl:backup:dl:${phone}`, 20, 3600)) {
      return res.status(429).json({error: 'Too many backup downloads. Try again later.'});
    }

    const result = await getPool().query(
      `SELECT ciphertext, nonce, salt, kdf_params, format_version, updated_at
       FROM device_backups WHERE phone = $1`,
      [phone],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({error: 'No backup found'});
    }
    const row = result.rows[0];
    return res.json({
      ciphertext: (row.ciphertext as Buffer).toString('base64'),
      nonce: (row.nonce as Buffer).toString('base64'),
      salt: (row.salt as Buffer).toString('base64'),
      kdfParams: row.kdf_params,
      formatVersion: row.format_version,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('Backup download failed:', err);
    return res.status(500).json({error: 'Internal server error'});
  }
});

/**
 * DELETE /api/backup
 * Delete the stored backup for the authenticated phone.
 */
backupRouter.delete('/', async (req: Request, res: Response) => {
  try {
    const phone = req.phone!;
    const result = await getPool().query(
      'DELETE FROM device_backups WHERE phone = $1',
      [phone],
    );
    return res.json({success: true, deleted: result.rowCount || 0});
  } catch (err) {
    console.error('Backup delete failed:', err);
    return res.status(500).json({error: 'Internal server error'});
  }
});
