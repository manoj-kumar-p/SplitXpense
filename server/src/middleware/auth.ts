import {Request, Response, NextFunction} from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'splitxpense-dev-secret';

declare global {
  namespace Express {
    interface Request {
      phone?: string;
    }
  }
}

/**
 * JWT auth middleware.
 * Reads Authorization: Bearer <token>, verifies it, and attaches `req.phone`.
 * Returns 401 if the token is missing or invalid.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({error: 'Missing or malformed Authorization header'});
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {phone: string};
    req.phone = payload.phone;
    next();
  } catch (_err) {
    res.status(401).json({error: 'Invalid or expired token'});
  }
}

/**
 * Generate a JWT token for a given phone number.
 * Used at registration time.
 */
export function generateToken(phone: string): string {
  return jwt.sign({phone}, JWT_SECRET, {expiresIn: '90d'});
}
