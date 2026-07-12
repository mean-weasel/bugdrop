// Per-tenant enforcement layer — contract docs/plans/multi-tenant-embed.md (card
// M1-03, decision D4). Mounted at /api/t/:key. Resolves the tenant once per request
// (404 unknown, 403 paused), enforces CORS against exactly `tenant.origins` (including
// preflight; a present-but-disallowed Origin is rejected 403 outright, not just left
// for the browser to block client-side — no-Origin requests such as curl or
// server-to-server calls are allowed, matching legacy semantics), pins the repo to
// `tenant.repo` (mismatch -> 400), and rate-limits with a `t:{key}:` KV prefix so
// tenant traffic never shares a bucket with another tenant or with the legacy global
// routes. All business logic is delegated to the exact same
// handleCheckRequest/handleFeedbackRequest used by the legacy /api routes.
//
// Mount order note (verified against the installed Hono version, see
// node_modules/hono): when two sub-apps are mounted with `app.route()` on prefixes
// that overlap textually (`/api` and `/api/t/:key`), a wildcard `'*'` middleware
// registered inside the FIRST-mounted sub-app also matches requests under the
// second prefix. Mounting this router before `api` in src/index.ts keeps the legacy
// global CORS middleware (global ALLOWED_ORIGINS) from running on tenant traffic.

import { Hono, type Context, type Next } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '../types';
import { getTenant } from '../lib/tenantStore';
import type { TenantConfig } from '../lib/tenants';
import { getClientIp } from '../middleware/rateLimit';
import { handleCheckRequest, handleFeedbackRequest, type ApiEnv } from './api';

type TenantApiVariables = { tenant: TenantConfig };
type TenantApiEnv = { Bindings: Env; Variables: TenantApiVariables };

const DEFAULT_IP_WINDOW_MS = 15 * 60 * 1000; // matches legacy /api/feedback IP window
const DEFAULT_IP_MAX_REQUESTS = 20;
const DEFAULT_REPO_WINDOW_MS = 60 * 60 * 1000; // matches legacy /api/feedback repo window
const DEFAULT_REPO_MAX_REQUESTS = 50;

const tenantApi = new Hono<TenantApiEnv>();

// Resolve the tenant once per request; downstream middleware/handlers read it via
// c.get('tenant'). D10's warn-only loader body is a loader-route concern only — API
// traffic for an unknown/paused tenant gets a plain JSON error (D4).
tenantApi.use('*', async (c, next) => {
  const key = c.req.param('key');
  const tenant = key ? await getTenant(c.env, key) : null;

  if (!tenant) {
    return c.json({ error: 'Unknown tenant' }, 404);
  }
  if (tenant.status === 'paused') {
    return c.json({ error: 'Tenant is paused' }, 403);
  }

  c.set('tenant', tenant);
  return next();
});

// Explicit origin allowlist enforcement (D4): a present-but-disallowed Origin is
// rejected 403 outright, including on preflight, rather than left for the browser to
// block client-side after a response with no CORS header. An absent Origin (curl,
// server-to-server) is allowed through, matching legacy semantics.
tenantApi.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  const tenant = c.get('tenant');
  if (origin && !tenant.origins.includes(origin)) {
    return c.json({ error: 'Origin not allowed for this tenant' }, 403);
  }
  return next();
});

// CORS headers + preflight handling for whatever Origin survived the guard above (an
// allowed origin, or none). Every value this ever sees has already been validated
// against tenant.origins, so it only needs to echo it back (or fall back to '*' for
// no-Origin requests, matching the legacy /api CORS middleware's behavior).
tenantApi.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: origin => origin || '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  });
  return corsMiddleware(c, next);
});

tenantApi.get('/check/:owner/:repo', async c => {
  const tenant = c.get('tenant');
  const { owner, repo } = c.req.param();
  if (`${owner}/${repo}` !== tenant.repo) {
    return c.json({ error: 'Repository does not match tenant configuration' }, 400);
  }
  return handleCheckRequest(asApiContext(c));
});

tenantApi.use('/feedback', requireTenantRepoMatch);
tenantApi.use('/feedback', tenantIpRateLimit);
tenantApi.use('/feedback', tenantRepoRateLimit);
tenantApi.post('/feedback', async c => handleFeedbackRequest(asApiContext(c)));

/**
 * Rejects a /feedback submission whose body repo does not match tenant.repo (D4).
 * Mirrors the clone-then-parse pattern used by the legacy
 * requireBugDropFeedbackAuthToken middleware so the body can still be read once more
 * downstream: on invalid JSON here, this simply lets handleFeedbackRequest return its
 * own "Invalid JSON" response instead of failing early with an unrelated error.
 */
async function requireTenantRepoMatch(
  c: Context<TenantApiEnv>,
  next: Next
): Promise<Response | void> {
  const tenant = c.get('tenant');
  try {
    const payload = (await c.req.raw.clone().json()) as { repo?: unknown };
    if (typeof payload.repo === 'string' && payload.repo !== tenant.repo) {
      return c.json({ error: 'Repository does not match tenant configuration' }, 400);
    }
  } catch {
    // Let handleFeedbackRequest return its own "Invalid JSON" response.
  }
  return next();
}

async function tenantIpRateLimit(c: Context<TenantApiEnv>, next: Next): Promise<Response | void> {
  const tenant = c.get('tenant');
  return enforceTenantRateLimit(c, next, {
    windowMs: DEFAULT_IP_WINDOW_MS,
    maxRequests: tenant.rate?.perIp ?? DEFAULT_IP_MAX_REQUESTS,
    bucketKey: `t:${tenant.key}:ip:${getClientIp(c)}`,
  });
}

async function tenantRepoRateLimit(c: Context<TenantApiEnv>, next: Next): Promise<Response | void> {
  const tenant = c.get('tenant');
  return enforceTenantRateLimit(c, next, {
    windowMs: DEFAULT_REPO_WINDOW_MS,
    maxRequests: tenant.rate?.perRepo ?? DEFAULT_REPO_MAX_REQUESTS,
    bucketKey: `t:${tenant.key}:repo:${tenant.repo}`,
  });
}

interface RateLimitBucket {
  windowMs: number;
  maxRequests: number;
  bucketKey: string;
}

/**
 * Fixed-window counter identical in shape to src/middleware/rateLimit.ts, but keyed
 * under the tenant-scoped bucket built by the callers above (`t:{key}:...`) so tenant
 * traffic never shares a bucket with another tenant or with the legacy global routes.
 * Skips (allows through) when KV is unconfigured or in development, matching legacy.
 */
async function enforceTenantRateLimit(
  c: Context<TenantApiEnv>,
  next: Next,
  { windowMs, maxRequests, bucketKey }: RateLimitBucket
): Promise<Response | void> {
  const kv = c.env.RATE_LIMIT;
  if (!kv || c.env.ENVIRONMENT === 'development') return next();

  const windowStart = Math.floor(Date.now() / windowMs);
  const key = `${bucketKey}:${windowStart}`;

  try {
    const currentCount = parseInt((await kv.get(key)) || '0', 10);
    if (currentCount >= maxRequests) {
      const retryAfter = Math.ceil(windowMs / 1000);
      return c.json({ error: 'Too many requests. Please try again later.', retryAfter }, 429, {
        'Retry-After': String(retryAfter),
      });
    }

    await kv.put(key, String(currentCount + 1), { expirationTtl: Math.ceil(windowMs / 1000) });
    return next();
  } catch (error) {
    console.error('[tenantApi] rate limit KV error:', error);
    return next();
  }
}

/**
 * The shared handlers are typed against api.ts's ApiEnv (Variables: { feedbackPayload
 * }). This router's own Context carries a different Variables shape (Variables:
 * { tenant }), and it never sets feedbackPayload — handleFeedbackRequest already
 * falls back to re-parsing the body itself (`c.get('feedbackPayload') ??
 * await c.req.json()`) when it is absent, so this cast changes no behavior; it only
 * satisfies TypeScript across the two Hono apps' distinct Variables types.
 */
function asApiContext(c: Context<TenantApiEnv>): Context<ApiEnv> {
  return c as unknown as Context<ApiEnv>;
}

export default tenantApi;
export type { TenantApiEnv };
