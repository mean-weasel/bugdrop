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
import type { Env, FeedbackPayload } from '../types';
import { getTenant } from '../lib/tenantStore';
import type { TenantConfig } from '../lib/tenants';
import { applyFixedWindowLimit, getClientIp } from '../middleware/rateLimit';
import {
  getBearerToken,
  handleCheckRequest,
  handleFeedbackRequest,
  requireBugDropFeedbackAuthToken,
  type ApiEnv,
} from './api';
import { verifyBugDropAuthToken } from '../lib/authToken';
import { unwrapSecret } from '../lib/envelope';

type TenantApiVariables = { tenant: TenantConfig; feedbackPayload?: FeedbackPayload };
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

// Middleware order mirrors the legacy /api/feedback chain exactly (src/routes/api.ts):
// IP rate limit -> auth -> repo rate limit. The IP limit runs FIRST, before auth, so a
// flood of requests carrying invalid/missing bd1. tokens still consumes IP quota
// instead of bypassing rate limiting entirely (an attacker retrying bad tokens would
// otherwise never hit a bucket). requireTenantRepoMatch runs right after auth because
// it needs the parsed body, which auth already parsed and cached when secrets are
// configured (see requireTenantRepoMatch's own comment, FIX 3). The repo rate limit
// runs last, same relative position as legacy's rateLimitByRepo.
tenantApi.use('/feedback', tenantIpRateLimit);
tenantApi.use('/feedback', requireTenantWidgetAuth);
tenantApi.use('/feedback', requireTenantRepoMatch);
tenantApi.use('/feedback', tenantRepoRateLimit);
tenantApi.post('/feedback', async c => handleFeedbackRequest(asApiContext(c)));

/**
 * Widget-auth for tenant feedback (D5/M2-01). A tenant WITH its own secret
 * (authTokenSecretEnc) must present a bd1. token signed with THAT secret and
 * pinned to tenant.repo — global AUTH_TOKEN_SECRET* tokens do not apply to it.
 * A tenant WITHOUT its own secret keeps parity with the legacy route: the
 * globally-configured secrets are enforced when present (M1 amendment).
 * Fail-loud per D5: an envelope that cannot be unwrapped (missing/invalid
 * BUGDROP_KEK, corrupt envelope) is a 500, never a silent skip.
 */
async function requireTenantWidgetAuth(
  c: Context<TenantApiEnv>,
  next: Next
): Promise<Response | void> {
  const tenant = c.get('tenant');
  if (!tenant.authTokenSecretEnc) {
    return requireBugDropFeedbackAuthToken(asApiContext(c), next);
  }

  let secret: string;
  try {
    secret = await unwrapSecret(tenant.authTokenSecretEnc, c.env.BUGDROP_KEK);
  } catch (error) {
    console.error(
      '[tenantApi] cannot unwrap tenant auth secret:',
      error instanceof Error ? error.message : String(error)
    );
    return c.json({ error: 'Tenant widget auth is misconfigured' }, 500);
  }

  try {
    await verifyBugDropAuthToken(getBearerToken(c.req.header('Authorization')), {
      secret,
      repo: tenant.repo,
    });
  } catch (error) {
    console.warn('[tenantApi] rejected tenant auth token', {
      tenant: tenant.key,
      reason: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: 'BugDrop auth token required' }, 401);
  }

  return next();
}

/**
 * Rejects a /feedback submission whose body repo does not match tenant.repo (D4).
 * Reuses the body already parsed and cached by requireBugDropFeedbackAuthToken
 * (c.get('feedbackPayload')) when present — that middleware only sets it when
 * widget-auth secrets are configured, in which case it already consumed the one
 * read of a non-cloned body via c.req.raw.clone().json(). Falls back to its own
 * clone-then-parse (mirroring the same pattern) only when that cache is absent,
 * so the body is never parsed from the same non-cloned stream twice. On invalid
 * JSON this simply lets handleFeedbackRequest return its own "Invalid JSON"
 * response instead of failing early with an unrelated error.
 */
async function requireTenantRepoMatch(
  c: Context<TenantApiEnv>,
  next: Next
): Promise<Response | void> {
  const tenant = c.get('tenant');
  try {
    const payload: { repo?: unknown } =
      c.get('feedbackPayload') ?? ((await c.req.raw.clone().json()) as { repo?: unknown });
    if (typeof payload.repo === 'string' && payload.repo !== tenant.repo) {
      return c.json({ error: 'Repository does not match tenant configuration' }, 400);
    }
  } catch {
    // Let handleFeedbackRequest return its own "Invalid JSON" response.
  }
  return next();
}

/**
 * Parity with legacy /api/feedback's IP limiter (rateLimit() in
 * src/middleware/rateLimit.ts): same window/default, same X-RateLimit-* headers on
 * success, keyed under `t:{key}:ip:...` (review pass 2, FIX 6) so tenant traffic
 * never shares a bucket with another tenant or the legacy global routes.
 */
async function tenantIpRateLimit(c: Context<TenantApiEnv>, next: Next): Promise<Response | void> {
  const kv = c.env.RATE_LIMIT;
  if (!kv || c.env.ENVIRONMENT === 'development') return next();

  const tenant = c.get('tenant');
  const maxRequests = tenant.rate?.perIp ?? DEFAULT_IP_MAX_REQUESTS;

  try {
    const result = await applyFixedWindowLimit(kv, {
      key: `t:${tenant.key}:ip:${getClientIp(c)}`,
      windowMs: DEFAULT_IP_WINDOW_MS,
      maxRequests,
    });

    if (result.limited) {
      return c.json(
        { error: 'Too many requests. Please try again later.', retryAfter: result.retryAfter },
        429,
        { 'Retry-After': String(result.retryAfter) }
      );
    }

    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    return next();
  } catch (error) {
    console.error('[tenantApi] rate limit KV error:', error);
    return next();
  }
}

/**
 * Parity with legacy /api/feedback's repo limiter (rateLimitByRepo()), keyed under
 * `t:{key}:repo:...` (review pass 2, FIX 6) so tenant traffic never shares a bucket
 * with another tenant or the legacy global routes.
 */
async function tenantRepoRateLimit(c: Context<TenantApiEnv>, next: Next): Promise<Response | void> {
  const kv = c.env.RATE_LIMIT;
  if (!kv || c.env.ENVIRONMENT === 'development') return next();

  const tenant = c.get('tenant');

  try {
    const result = await applyFixedWindowLimit(kv, {
      key: `t:${tenant.key}:repo:${tenant.repo}`,
      windowMs: DEFAULT_REPO_WINDOW_MS,
      maxRequests: tenant.rate?.perRepo ?? DEFAULT_REPO_MAX_REQUESTS,
    });

    if (result.limited) {
      return c.json(
        { error: 'Too many requests. Please try again later.', retryAfter: result.retryAfter },
        429,
        { 'Retry-After': String(result.retryAfter) }
      );
    }

    return next();
  } catch (error) {
    console.error('[tenantApi] rate limit KV error:', error);
    return next();
  }
}

/**
 * The shared handlers are typed against api.ts's ApiEnv (Variables: { feedbackPayload
 * }). This router's own Context carries a superset Variables shape (Variables:
 * { tenant, feedbackPayload }), and setting/getting feedbackPayload through either
 * typed view reads/writes the same underlying Hono context object, so this cast
 * changes no runtime behavior; it only satisfies TypeScript across the two Hono
 * apps' distinct Variables types.
 */
function asApiContext(c: Context<TenantApiEnv>): Context<ApiEnv> {
  return c as unknown as Context<ApiEnv>;
}

export default tenantApi;
export type { TenantApiEnv };
