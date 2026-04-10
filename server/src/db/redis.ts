import {createClient, type RedisClientType} from 'redis';

let client: RedisClientType;

export async function initRedis(): Promise<void> {
  client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });
  client.on('error', err => console.error('Redis error:', err));
  await client.connect();
}

export function getRedis(): RedisClientType {
  if (!client) throw new Error('Redis not initialized');
  return client;
}

// Token cache helpers
export async function cacheToken(
  key: string,
  token: string,
  ttlSeconds: number,
): Promise<void> {
  await getRedis().setEx(key, ttlSeconds, token);
}

export async function getCachedToken(key: string): Promise<string | null> {
  return getRedis().get(key);
}

// Check if Redis is connected and ready
export function isRedisConnected(): boolean {
  return client?.isReady ?? false;
}

// Rate limiting helper
export async function isRateLimited(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!isRedisConnected()) return false; // fail open in degraded mode
  const redis = getRedis();
  const multi = redis.multi();
  multi.incr(key);
  multi.expire(key, windowSeconds);
  const results = await multi.exec();
  const current = results?.[0] as number;
  return current > maxRequests;
}

// Dedup helper
export async function isDuplicate(
  dedupKey: string,
  ttlSeconds: number = 300,
): Promise<boolean> {
  if (!isRedisConnected()) return false; // fail open in degraded mode
  const result = await getRedis().set(dedupKey, '1', {NX: true, EX: ttlSeconds});
  return result === null; // null means key already existed
}
