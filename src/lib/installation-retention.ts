import { generateGitHubAppJWT } from './jwt';
import { GITHUB_API, githubHeaders } from './github';
import type { Env } from '../types';

const INSTALLATION_RECORD_PREFIX = 'installation:';
const GITHUB_PAGE_SIZE = 100;
export const MAX_GITHUB_INSTALLATION_PAGES = 20;
export const INSTALLATION_SWEEP_PAGE_SIZE = 25;
export const MAX_CONCURRENT_CLEANUP_OPERATIONS = 6;

export const INSTALLATION_CLEANUP_AUDIT_KEY = 'operations:installation-cleanup:last-success';
export const INSTALLATION_CLEANUP_CHECKPOINT_KEY = 'operations:installation-cleanup:checkpoint';

export interface InstallationCleanupAudit {
  schemaVersion: 1;
  completedAt: string;
  scannedCount: number;
  activeCount: number;
  deletedCount: number;
}

interface GitHubListOptions {
  fetchImpl?: typeof fetch;
  createJwt?: (appId: string, privateKey: string) => Promise<string>;
}

interface InstallationSweepOptions {
  now?: Date;
  listActiveInstallationIds?: (env: Env) => Promise<Set<number>>;
  confirmInstallationIsInactive?: (env: Env, installationId: number) => Promise<boolean>;
}

interface InstallationCleanupCheckpoint {
  schemaVersion: 1;
  cursor: string;
  startedAt: string;
  scannedCount: number;
  deletedCount: number;
}

export function installationRecordKey(installationId: number): string {
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw new Error('Invalid installation ID');
  }
  return `${INSTALLATION_RECORD_PREFIX}${installationId}`;
}

export async function deleteInstallationRecord(
  store: KVNamespace,
  installationId: number
): Promise<void> {
  await store.delete(installationRecordKey(installationId));
}

export async function verifyGitHubWebhookSignature(
  secret: string,
  signatureHeader: string | undefined,
  body: string
): Promise<boolean> {
  if (!secret || !signatureHeader?.startsWith('sha256=')) return false;

  const supplied = hexToBytes(signatureHeader.slice('sha256='.length));
  if (!supplied) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify('HMAC', key, supplied, new TextEncoder().encode(body));
}

export async function listActiveGitHubInstallationIds(
  env: Env,
  options: GitHubListOptions = {}
): Promise<Set<number>> {
  if (!env.GITHUB_APP_ID || !env.GITHUB_PRIVATE_KEY) {
    throw new Error('GitHub App credentials are required for installation cleanup');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const createJwt = options.createJwt ?? generateGitHubAppJWT;
  const jwt = await createJwt(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY);
  const activeIds = new Set<number>();

  for (let page = 1; page <= MAX_GITHUB_INSTALLATION_PAGES; page += 1) {
    const response = await fetchImpl(
      `${GITHUB_API}/app/installations?per_page=${GITHUB_PAGE_SIZE}&page=${page}`,
      {
        headers: githubHeaders(jwt),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list GitHub App installations: ${response.status}`);
    }

    const installations = (await response.json()) as unknown;
    if (!Array.isArray(installations)) {
      throw new Error('GitHub returned an invalid installation list');
    }

    for (const installation of installations) {
      const id = installationIdFromGitHub(installation);
      activeIds.add(id);
    }

    if (installations.length < GITHUB_PAGE_SIZE) return activeIds;
  }

  throw new Error('GitHub installation pagination exceeded the safety limit');
}

export async function confirmGitHubInstallationIsInactive(
  env: Env,
  installationId: number,
  options: GitHubListOptions = {}
): Promise<boolean> {
  if (!env.GITHUB_APP_ID || !env.GITHUB_PRIVATE_KEY) {
    throw new Error('GitHub App credentials are required for installation cleanup');
  }
  installationRecordKey(installationId);

  const fetchImpl = options.fetchImpl ?? fetch;
  const createJwt = options.createJwt ?? generateGitHubAppJWT;
  const jwt = await createJwt(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY);
  const response = await fetchImpl(`${GITHUB_API}/app/installations/${installationId}`, {
    headers: githubHeaders(jwt),
  });
  if (response.body) await response.body.cancel();

  if (response.ok) return false;
  if (response.status === 404) return true;
  throw new Error(`Failed to confirm GitHub App installation: ${response.status}`);
}

export async function sweepInstallationRecords(
  env: Env,
  options: InstallationSweepOptions = {}
): Promise<InstallationCleanupAudit | null> {
  const store = env.INSTALLATION_ANALYTICS;
  if (!store) throw new Error('INSTALLATION_ANALYTICS binding is required for cleanup');

  const now = options.now ?? new Date();
  const checkpoint = parseCheckpoint(await store.get(INSTALLATION_CLEANUP_CHECKPOINT_KEY));
  const listActive = options.listActiveInstallationIds ?? listActiveGitHubInstallationIds;
  const activeIds = await listActive(env);
  const storedPage = await listStoredInstallationPage(store, checkpoint?.cursor);
  const staleIds = storedPage.ids.filter(id => !activeIds.has(id));
  let confirmInactive = options.confirmInstallationIsInactive;
  if (!confirmInactive && staleIds.length > 0) {
    if (!env.GITHUB_APP_ID || !env.GITHUB_PRIVATE_KEY) {
      throw new Error('GitHub App credentials are required for installation cleanup');
    }
    const jwt = await generateGitHubAppJWT(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY);
    confirmInactive = (candidateEnv, installationId) =>
      confirmGitHubInstallationIsInactive(candidateEnv, installationId, {
        createJwt: async () => jwt,
      });
  }
  const inactiveResults = confirmInactive
    ? await mapInBatches(staleIds, id => confirmInactive(env, id))
    : [];
  const confirmedInactiveIds = staleIds.filter((_id, index) => inactiveResults[index]);

  await mapInBatches(confirmedInactiveIds, id => deleteInstallationRecord(store, id));

  const scannedCount = (checkpoint?.scannedCount ?? 0) + storedPage.ids.length;
  const deletedCount = (checkpoint?.deletedCount ?? 0) + confirmedInactiveIds.length;
  if (storedPage.cursor) {
    const nextCheckpoint: InstallationCleanupCheckpoint = {
      schemaVersion: 1,
      cursor: storedPage.cursor,
      startedAt: checkpoint?.startedAt ?? now.toISOString(),
      scannedCount,
      deletedCount,
    };
    await store.put(INSTALLATION_CLEANUP_CHECKPOINT_KEY, JSON.stringify(nextCheckpoint));
    return null;
  }

  const audit: InstallationCleanupAudit = {
    schemaVersion: 1,
    completedAt: now.toISOString(),
    scannedCount,
    activeCount: activeIds.size,
    deletedCount,
  };
  await store.delete(INSTALLATION_CLEANUP_CHECKPOINT_KEY);
  await store.put(INSTALLATION_CLEANUP_AUDIT_KEY, JSON.stringify(audit));
  return audit;
}

async function listStoredInstallationPage(
  store: KVNamespace,
  cursor?: string
): Promise<{ ids: number[]; cursor?: string }> {
  const ids: number[] = [];
  const page = await store.list({
    prefix: INSTALLATION_RECORD_PREFIX,
    limit: INSTALLATION_SWEEP_PAGE_SIZE,
    ...(cursor ? { cursor } : {}),
  });
  for (const key of page.keys) {
    const rawId = key.name.slice(INSTALLATION_RECORD_PREFIX.length);
    if (!/^\d+$/.test(rawId)) {
      throw new Error(`Malformed installation record key: ${key.name}`);
    }
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`Malformed installation record key: ${key.name}`);
    }
    ids.push(id);
  }
  if (!page.list_complete && !page.cursor) {
    throw new Error('Installation record pagination omitted its cursor');
  }

  return { ids, ...(page.list_complete ? {} : { cursor: page.cursor }) };
}

function parseCheckpoint(value: string | null): InstallationCleanupCheckpoint | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<InstallationCleanupCheckpoint>;
    if (
      parsed.schemaVersion !== 1 ||
      typeof parsed.cursor !== 'string' ||
      !parsed.cursor ||
      typeof parsed.startedAt !== 'string' ||
      !Number.isSafeInteger(parsed.scannedCount) ||
      !Number.isSafeInteger(parsed.deletedCount) ||
      (parsed.scannedCount ?? -1) < 0 ||
      (parsed.deletedCount ?? -1) < 0 ||
      (parsed.deletedCount ?? 0) > (parsed.scannedCount ?? -1)
    ) {
      throw new Error('invalid checkpoint fields');
    }
    return parsed as InstallationCleanupCheckpoint;
  } catch {
    throw new Error('Malformed installation cleanup checkpoint');
  }
}

function installationIdFromGitHub(value: unknown): number {
  if (!value || typeof value !== 'object' || !('id' in value)) {
    throw new Error('GitHub returned an invalid installation record');
  }
  const id = (value as { id: unknown }).id;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error('GitHub returned an invalid installation ID');
  }
  return id;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function mapInBatches<T, Result>(
  values: T[],
  callback: (value: T) => Promise<Result>
): Promise<Result[]> {
  const results: Result[] = [];
  for (let offset = 0; offset < values.length; offset += MAX_CONCURRENT_CLEANUP_OPERATIONS) {
    const batch = values.slice(offset, offset + MAX_CONCURRENT_CLEANUP_OPERATIONS);
    results.push(...(await Promise.all(batch.map(callback))));
  }
  return results;
}
