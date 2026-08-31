import { INSTALLATION_RECORD_PREFIX, createInstallationRecord } from './installation-analytics';
import {
  confirmGitHubInstallationIsInactive,
  deleteInstallationData,
  INSTALLATION_SWEEP_PAGE_SIZE,
} from './installation-retention';
import {
  listActiveGitHubInstallations,
  type GitHubInstallationInventory,
} from './github-installation-inventory';
import type { Env } from '../types';

const STORED_RECORD_PAGE_SIZE = 1000;
const MAX_STORED_RECORD_PAGES = 20;
const INSTALLATION_RECONCILIATION_BATCH_SIZE = 25;
export const MAX_SCHEDULED_GITHUB_REQUESTS = 50;
export const INSTALLATION_RECONCILIATION_AUDIT_KEY =
  'operations:installation-reconciliation:last-success';

type ReconciliationMode = 'dry-run' | 'apply';

interface ReconciliationOptions {
  mode?: ReconciliationMode;
  now?: Date;
  inventory?: GitHubInstallationInventory;
  confirmInactive?: (env: Env, installationId: number) => Promise<boolean>;
  deleteInstallation?: (env: Env, installationId: number) => Promise<void>;
}

interface InstallationReconciliationAudit {
  schemaVersion: 1;
  mode: ReconciliationMode;
  completedAt: string;
  activeCount: number;
  eligibleCount: number;
  skippedCount: number;
  existingCount: number;
  missingCount: number;
  processedCount: number;
  createdCount: number;
  inactiveCount: number;
  remainingCount: number;
}

export async function reconcileInstallationRecords(
  env: Env,
  options: ReconciliationOptions = {}
): Promise<InstallationReconciliationAudit> {
  const store = env.INSTALLATION_ANALYTICS;
  if (!store) throw new Error('INSTALLATION_ANALYTICS binding is required for reconciliation');

  const mode = options.mode ?? 'dry-run';
  const inventory = options.inventory ?? (await listActiveGitHubInstallations(env));
  const storedIds = await listStoredInstallationIds(store);
  const missing = inventory.records.filter(record => !storedIds.has(record.installationId));
  let createdCount = 0;
  let inactiveCount = 0;
  let processedCount = 0;

  if (mode === 'apply') {
    const confirmInactive = options.confirmInactive ?? confirmGitHubInstallationIsInactive;
    const deleteInstallation = options.deleteInstallation ?? deleteInstallationData;
    const batchSize = Math.max(
      0,
      Math.min(
        INSTALLATION_RECONCILIATION_BATCH_SIZE,
        MAX_SCHEDULED_GITHUB_REQUESTS - inventory.pageCount - INSTALLATION_SWEEP_PAGE_SIZE
      )
    );
    for (const installation of missing.slice(0, batchSize)) {
      processedCount += 1;
      const created = await createInstallationRecord(store, installation);
      if (await confirmInactive(env, installation.installationId)) {
        await deleteInstallation(env, installation.installationId);
        inactiveCount += 1;
      } else if (created) {
        createdCount += 1;
      }
    }
  }

  const audit: InstallationReconciliationAudit = {
    schemaVersion: 1,
    mode,
    completedAt: (options.now ?? new Date()).toISOString(),
    activeCount: inventory.installationIds.length,
    eligibleCount: inventory.records.length,
    skippedCount: inventory.skippedCount,
    existingCount: inventory.records.length - missing.length,
    missingCount: missing.length,
    processedCount,
    createdCount,
    inactiveCount,
    remainingCount: missing.length - processedCount,
  };
  if (mode === 'apply') {
    await store.put(INSTALLATION_RECONCILIATION_AUDIT_KEY, JSON.stringify(audit));
  }
  return audit;
}

async function listStoredInstallationIds(store: KVNamespace): Promise<Set<number>> {
  const ids = new Set<number>();
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < MAX_STORED_RECORD_PAGES; pageNumber += 1) {
    const page = await store.list({
      prefix: INSTALLATION_RECORD_PREFIX,
      limit: STORED_RECORD_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    for (const key of page.keys) {
      const rawId = key.name.slice(INSTALLATION_RECORD_PREFIX.length);
      if (!/^\d+$/.test(rawId)) throw new Error('Malformed installation record key');
      const id = Number(rawId);
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error('Malformed installation record key');
      }
      ids.add(id);
    }
    if (page.list_complete) return ids;
    if (!page.cursor) throw new Error('Installation record pagination omitted its cursor');
    cursor = page.cursor;
  }
  throw new Error('Installation record pagination exceeded the safety limit');
}
