// KV-backed tenant registry — frozen by contract docs/plans/multi-tenant-embed.md (card
// M0-02, decision D2). Point reads use cacheTtl: 60 at the edge; writes/deletes are
// immediate. Stored JSON is always re-validated against TenantConfig v1 on read so a
// corrupted/legacy record fails loud instead of being trusted blindly.

import { validateTenantConfig, type TenantConfig } from './tenants';
import type { Env } from '../types';

const TENANT_KEY_PREFIX = 'tenant:';

function storageKey(key: string): string {
  return `${TENANT_KEY_PREFIX}${key}`;
}

/**
 * Reads and validates a tenant config from KV. Returns null when the key is
 * missing, or when the stored JSON is not valid JSON or fails TenantConfig v1
 * validation (logging the failure so a corrupted record is debuggable).
 */
export async function getTenant(env: Env, key: string): Promise<TenantConfig | null> {
  const raw = await env.TENANTS.get(storageKey(key), { cacheTtl: 60 });
  if (raw === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(`[tenantStore] invalid JSON stored for tenant "${key}":`, error);
    return null;
  }

  const result = validateTenantConfig(parsed);
  if (!result.ok) {
    console.error(
      `[tenantStore] stored config for tenant "${key}" failed validation:`,
      result.errors
    );
    return null;
  }

  return result.value;
}

/**
 * Writes a validated tenant config to KV. Callers are responsible for
 * validating with `validateTenantConfig` before calling this (e.g. the admin
 * routes), so this function trusts its input's shape.
 */
export async function putTenant(env: Env, tenant: TenantConfig): Promise<void> {
  await env.TENANTS.put(storageKey(tenant.key), JSON.stringify(tenant));
}

/**
 * Deletes a tenant config from KV. No-op if the key does not exist.
 */
export async function deleteTenant(env: Env, key: string): Promise<void> {
  await env.TENANTS.delete(storageKey(key));
}

export interface TenantListEntry {
  key: string;
  name: string;
}

/**
 * Lists tenants by the `tenant:` key prefix, returning only key + name (not
 * full config) per D6's admin list surface. Skips entries that fail to parse
 * or validate, logging each so a corrupted record doesn't break the listing.
 */
export async function listTenants(env: Env): Promise<TenantListEntry[]> {
  const listed = await env.TENANTS.list({ prefix: TENANT_KEY_PREFIX });
  const entries: TenantListEntry[] = [];

  for (const item of listed.keys) {
    const key = item.name.slice(TENANT_KEY_PREFIX.length);
    const tenant = await getTenant(env, key);
    if (tenant) {
      entries.push({ key: tenant.key, name: tenant.name });
    }
  }

  return entries;
}
