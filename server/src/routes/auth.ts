import {Router, Request, Response} from 'express';
import {getPool} from '../db/postgres';
import {authMiddleware, generateToken} from '../middleware/auth';
import {isRateLimited} from '../db/redis';
import {maskPhone} from '../utils/mask';

export const authRouter = Router();

function isValidPhone(phone: string): boolean {
  return /^\+?\d{10,15}$/.test(phone.replace(/\s/g, ''));
}

/**
 * POST /api/auth/register
 * Register a device with FCM token and phone number.
 * Body: { phone: string, fcmToken: string }
 * Returns a JWT token for subsequent authenticated requests.
 */
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const {phone, fcmToken} = req.body;

    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({error: 'phone is required'});
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({error: 'Invalid phone number format'});
    }
    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({error: 'fcmToken is required'});
    }

    // Rate limit: 5 requests per minute per IP
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const rateLimitKey = `rl:register:${ip}`;
    if (await isRateLimited(rateLimitKey, 5, 60)) {
      return res.status(429).json({error: 'Too many requests. Try again later.'});
    }

    await getPool().query(
      `INSERT INTO devices (phone, fcm_token, registered_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (phone) DO UPDATE SET fcm_token = $2, updated_at = NOW()
       RETURNING *`,
      [phone, fcmToken],
    );

    const token = generateToken(phone);

    console.log(`Device registered: ${maskPhone(phone)}`);
    return res.json({success: true, phone, token});
  } catch (err) {
    console.error('Registration failed:', err);
    return res.status(500).json({error: 'Internal server error'});
  }
});

/**
 * POST /api/auth/refresh-fcm
 * Update the FCM token for a registered device.
 * Body: { fcmToken: string }
 * Requires authentication (phone is taken from JWT).
 */
authRouter.post('/refresh-fcm', authMiddleware, async (req: Request, res: Response) => {
  try {
    const phone = req.phone!;
    const {fcmToken} = req.body;

    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({error: 'fcmToken is required'});
    }

    const result = await getPool().query(
      'UPDATE devices SET fcm_token = $1, updated_at = NOW() WHERE phone = $2 RETURNING *',
      [fcmToken, phone],
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({error: 'Device not registered. Call /register first.'});
    }

    console.log(`FCM token refreshed: ${maskPhone(phone)}`);
    return res.json({success: true, phone});
  } catch (err) {
    console.error('FCM token refresh failed:', err);
    return res.status(500).json({error: 'Internal server error'});
  }
});

/**
 * Helper: get the FCM token for a phone number.
 * Used by other modules to send push notifications.
 */
export async function getFcmTokenForPhone(
  phone: string,
): Promise<string | null> {
  const result = await getPool().query(
    'SELECT fcm_token FROM devices WHERE phone = $1',
    [phone],
  );
  return result.rows[0]?.fcm_token || null;
}
