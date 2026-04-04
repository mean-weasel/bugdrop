import type { Context, Next } from 'hono';
import type { Env } from '../types';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyPrefix: string; // Key prefix for KV storage
}

/**
 * Extract client IP from Cloudflare headers
 */
function getClientIp(c: Context<{ Bindings: Env }>): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/**
 * Create a rate limiting middleware for IP-based limiting
 */
export function rateLimit(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyPrefix } = config;

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const kv = c.env.RATE_LIMIT;

    // Skip if KV not configured (development without KV)
    if (!kv) {
      console.warn('[RateLimit] KV not configured, skipping rate limit');
      return next();
    }

    const clientIp = getClientIp(c);
    const windowStart = Math.floor(Date.now() / windowMs);
    const key = `${keyPrefix}:${clientIp}:${windowStart}`;

    try {
      // Get current count
      const currentCount = parseInt((await kv.get(key)) || '0', 10);

      if (currentCount >= maxRequests) {
        const retryAfter = Math.ceil(windowMs / 1000);
        return c.json(
          {
            error: 'Too many requests. Please try again later.',
            retryAfter,
          },
          429,
          { 'Retry-After': String(retryAfter) }
        );
      }

      // Increment count with TTL
      const ttlSeconds = Math.ceil(windowMs / 1000);
      await kv.put(key, String(currentCount + 1), { expirationTtl: ttlSeconds });

      // Add rate limit headers
      c.header('X-RateLimit-Limit', String(maxRequests));
      c.header('X-RateLimit-Remaining', String(maxRequests - currentCount - 1));

      return next();
    } catch (error) {
      // On KV error, allow request but log warning
      console.error('[RateLimit] KV error:', error);
      return next();
    }
  };
}

/**
 * Rate limit by repo (for /api/feedback endpoint)
 * This middleware reads the request body to extract the repo, so it must
 * be used with care - the body can only be read once per request.
 */
export function rateLimitByRepo(config: Omit<RateLimitConfig, 'keyPrefix'>) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const kv = c.env.RATE_LIMIT;

    if (!kv) {
      return next();
    }

    // Only apply to POST requests
    if (c.req.method !== 'POST') {
      return next();
    }

    try {
      // Clone request to read body without consuming it
      const clonedRequest = c.req.raw.clone();
      const body = (await clonedRequest.json()) as { repo?: string };
      const repo = body.repo;

      if (!repo) {
        return next(); // Will fail validation in the route handler
      }

      const windowMs = config.windowMs;
      const maxRequests = config.maxRequests;
      const windowStart = Math.floor(Date.now() / windowMs);
      const key = `repo:${repo}:${windowStart}`;

      const currentCount = parseInt((await kv.get(key)) || '0', 10);

      if (currentCount >= maxRequests) {
        return c.json(
          {
            error:
              'This repository has received too many feedback submissions. Please try again later.',
          },
          429
        );
      }

      await kv.put(key, String(currentCount + 1), {
        expirationTtl: Math.ceil(windowMs / 1000),
      });

      return next();
    } catch {
      // On error (e.g., invalid JSON), let the route handler deal with it
      return next();
    }
  };
}
