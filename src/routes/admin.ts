// Tenant admin CRUD — frozen by contract docs/plans/multi-tenant-embed.md (card
// M0-03, decision D6). Mounted at /api/admin. Bearer-token protected, no CORS
// allowance (same-origin/curl only). Missing ADMIN_TOKEN secret fails loud (503
// on every route) rather than silently opening the surface.

import { Hono } from 'hono';
import type { Env } from '../types';
import { wrapSecret } from '../lib/envelope';
import { deleteTenant, getTenant, listTenants, putTenant } from '../lib/tenantStore';
import { validateTenantConfig, type TenantConfig } from '../lib/tenants';
import { isPlainObject } from '../lib/tenantFieldValidators';
import { timingSafeEqual } from '../lib/timingSafeEqual';

const admin = new Hono<{ Bindings: Env }>();

admin.use('*', async (c, next) => {
  const adminToken = c.env.ADMIN_TOKEN;
  if (!adminToken) {
    return c.json({ error: 'Admin API is not configured' }, 503);
  }
  if (!c.env.TENANTS) {
    return c.json({ error: 'Tenant storage is not configured' }, 503);
  }

  const authHeader = c.req.header('Authorization') ?? '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token || !timingSafeEqual(token, adminToken)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return next();
});

admin.get('/tenants', async c => {
  const entries = await listTenants(c.env);
  return c.json({ tenants: entries });
});

admin.get('/tenants/:key', async c => {
  const tenant = await getTenant(c.env, c.req.param('key'));
  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }
  return c.json(maskTenant(tenant));
});

admin.post('/tenants', async c => {
  const body = await parseJsonBody(c.req.raw);
  if (!body.ok) {
    return c.json({ errors: [body.error] }, 400);
  }

  const key = isPlainObject(body.value) ? body.value.key : undefined;
  if (typeof key === 'string' && (await getTenant(c.env, key))) {
    return c.json({ error: 'Tenant already exists' }, 409);
  }

  const record = asRecord(body.value);
  const secretError = await absorbWriteOnlySecret(record, c.env);
  if (secretError) return secretError;

  const now = new Date().toISOString();
  const candidate = { ...record, version: 1, createdAt: now, updatedAt: now };
  const result = validateTenantConfig(candidate);
  if (!result.ok) {
    return c.json({ errors: result.errors }, 400);
  }

  await putTenant(c.env, result.value);
  return c.json(maskTenant(result.value), 201);
});

admin.put('/tenants/:key', async c => {
  const key = c.req.param('key');
  const existing = await getTenant(c.env, key);
  if (!existing) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  const body = await parseJsonBody(c.req.raw);
  if (!body.ok) {
    return c.json({ errors: [body.error] }, 400);
  }

  const record = asRecord(body.value);
  if (record.key !== undefined && record.key !== key) {
    return c.json({ errors: ['body key must match the :key path parameter'] }, 400);
  }

  // A PUT that neither rotates (authTokenSecret) nor clears (authTokenSecret:
  // null) the secret inherits the stored envelope — otherwise every unrelated
  // config update would silently drop the tenant's widget-auth.
  if (
    record.authTokenSecret === undefined &&
    record.authTokenSecretEnc === undefined &&
    existing.authTokenSecretEnc !== undefined
  ) {
    record.authTokenSecretEnc = existing.authTokenSecretEnc;
  }
  const secretError = await absorbWriteOnlySecret(record, c.env);
  if (secretError) return secretError;

  const candidate = {
    ...record,
    key,
    version: 1,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  const result = validateTenantConfig(candidate);
  if (!result.ok) {
    return c.json({ errors: result.errors }, 400);
  }

  await putTenant(c.env, result.value);
  return c.json(maskTenant(result.value), 200);
});

admin.delete('/tenants/:key', async c => {
  const key = c.req.param('key');
  const existing = await getTenant(c.env, key);
  if (!existing) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  await deleteTenant(c.env, key);
  return c.body(null, 204);
});

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

/**
 * Consumes the write-only `authTokenSecret` field (D5/M2-01): plaintext arrives
 * only in the request body, is wrapped with BUGDROP_KEK into
 * `authTokenSecretEnc`, and never reaches KV, logs, or responses.
 * `authTokenSecret: null` clears the stored envelope. Returns an error Response
 * or null on success; mutates `record` in place.
 */
async function absorbWriteOnlySecret(
  record: Record<string, unknown>,
  env: Env
): Promise<Response | null> {
  if (!('authTokenSecret' in record)) return null;

  const secret = record.authTokenSecret;
  delete record.authTokenSecret;

  if (secret === null) {
    delete record.authTokenSecretEnc;
    return null;
  }
  if (typeof secret !== 'string' || secret.length < 16 || secret.length > 256) {
    return Response.json(
      { errors: ['authTokenSecret must be a string of 16 to 256 characters (or null to clear)'] },
      { status: 400 }
    );
  }
  try {
    record.authTokenSecretEnc = await wrapSecret(secret, env.BUGDROP_KEK);
    return null;
  } catch (error) {
    // Fail-loud per D5: never store the tenant without the requested encryption.
    console.error(
      '[admin] cannot wrap tenant auth secret:',
      error instanceof Error ? error.message : String(error)
    );
    return Response.json({ error: 'BUGDROP_KEK is not configured or invalid' }, { status: 500 });
  }
}

/** Admin responses never expose the envelope — only whether a secret exists. */
function maskTenant(tenant: TenantConfig): Record<string, unknown> {
  const { authTokenSecretEnc, ...rest } = tenant;
  return { ...rest, hasAuthTokenSecret: authTokenSecretEnc !== undefined };
}

async function parseJsonBody(
  req: Request
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false, error: 'Request body must be valid JSON' };
  }
}

export default admin;
