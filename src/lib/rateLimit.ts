interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __sentinelRateLimitMap: Map<string, number[]> | undefined;
}

function getRateLimitMap(): Map<string, number[]> {
  if (!globalThis.__sentinelRateLimitMap) {
    globalThis.__sentinelRateLimitMap = new Map<string, number[]>();
  }
  return globalThis.__sentinelRateLimitMap;
}

/**
 * Extracts client IP from Request headers.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }
  return 'local';
}

/**
 * Sliding window in-memory rate limiter with periodic cleanup.
 */
export function checkRateLimit(options: RateLimitOptions): RateLimitResult {
  const { key, limit, windowMs } = options;
  const map = getRateLimitMap();
  const now = Date.now();
  const windowStart = now - windowMs;

  // Prune map if it exceeds 500 keys to prevent any memory growth
  if (map.size > 500) {
    for (const [k, timestamps] of map.entries()) {
      const valid = timestamps.filter((t) => t > windowStart);
      if (valid.length === 0) {
        map.delete(k);
      } else {
        map.set(k, valid);
      }
    }
  }

  const timestamps = (map.get(key) || []).filter((t) => t > windowStart);

  if (timestamps.length >= limit) {
    const oldestInWindow = timestamps[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec,
    };
  }

  timestamps.push(now);
  map.set(key, timestamps);

  return {
    allowed: true,
    remaining: limit - timestamps.length,
    retryAfterSec: 0,
  };
}
