import type { Context, Next } from 'hono';
import type { Env } from '../types';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyPrefix: string; // Key prefix for KV storage
}

/**
 * Extract client IP from Cloudflare headers. Exported so tenant-scoped rate limiting
 * (src/routes/tenantApi.ts, contract docs/plans/multi-tenant-embed.md card M1-03) can
 * reuse the same client-IP resolution without duplicating it. Generic over the Hono
 * env so it accepts a Context typed with any Variables shape (e.g. tenantApi's), not
 * just this file's own Bindings-only Context type.
 */
export function getClientIp<E extends { Bindings: Env }>(c: Context<E>): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export interface FixedWindowLimitParams {
  key: string; // base bucket key, WITHOUT the window suffix (this appends it)
  windowMs: number;
  maxRequests: number;
}

export interface FixedWindowLimitResult {
  limited: boolean;
  retryAfter: number; // seconds; always populated, even when not limited
  remaining: number; // 0 when limited
}

/**
 * Fixed-window counter core shared by rateLimit()/rateLimitByRepo() below and
 * by the tenant-scoped rate limiting in src/routes/tenantApi.ts (contract
 * docs/plans/multi-tenant-embed.md, card M1-03 / review-pass-2 FIX 6): get the
 * current count for the window, and if under the limit, increment with a TTL
 * matching the window. Callers own KV-unconfigured/dev-environment skips and
 * error handling — this function assumes `kv` is present and lets KV errors
 * propagate.
 */
export async function applyFixedWindowLimit(
  kv: KVNamespace,
  { key, windowMs, maxRequests }: FixedWindowLimitParams
): Promise<FixedWindowLimitResult> {
  const windowStart = Math.floor(Date.now() / windowMs);
  const windowKey = `${key}:${windowStart}`;
  const retryAfter = Math.ceil(windowMs / 1000);

  const currentCount = parseInt((await kv.get(windowKey)) || '0', 10);
  if (currentCount >= maxRequests) {
    return { limited: true, retryAfter, remaining: 0 };
  }

  await kv.put(windowKey, String(currentCount + 1), { expirationTtl: retryAfter });
  return { limited: false, retryAfter, remaining: maxRequests - currentCount - 1 };
}

/**
 * Create a rate limiting middleware for IP-based limiting
 */
export function rateLimit(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyPrefix } = config;

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const kv = c.env.RATE_LIMIT;

    // Skip if KV not configured or in development (avoids blocking E2E tests)
    if (!kv || c.env.ENVIRONMENT === 'development') {
      return next();
    }

    const clientIp = getClientIp(c);

    try {
      const result = await applyFixedWindowLimit(kv, {
        key: `${keyPrefix}:${clientIp}`,
        windowMs,
        maxRequests,
      });

      if (result.limited) {
        return c.json(
          {
            error: 'Too many requests. Please try again later.',
            retryAfter: result.retryAfter,
          },
          429,
          { 'Retry-After': String(result.retryAfter) }
        );
      }

      // Add rate limit headers
      c.header('X-RateLimit-Limit', String(maxRequests));
      c.header('X-RateLimit-Remaining', String(result.remaining));

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

    if (!kv || c.env.ENVIRONMENT === 'development') {
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

      const result = await applyFixedWindowLimit(kv, {
        key: `repo:${repo}`,
        windowMs: config.windowMs,
        maxRequests: config.maxRequests,
      });

      if (result.limited) {
        return c.json(
          {
            error:
              'This repository has received too many feedback submissions. Please try again later.',
          },
          429
        );
      }

      return next();
    } catch {
      // On error (e.g., invalid JSON), let the route handler deal with it
      return next();
    }
  };
}
