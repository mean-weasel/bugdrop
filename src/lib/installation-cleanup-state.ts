export interface InstallationCleanupAudit {
  schemaVersion: 1;
  completedAt: string;
  scannedCount: number;
  activeCount: number;
  deletedCount: number;
}

export interface InstallationScanningCheckpoint {
  schemaVersion: 1;
  phase: 'scanning';
  cursor: string;
  startedAt: string;
  scannedCount: number;
  deletedCount: number;
}

export interface InstallationFinalizingCheckpoint {
  schemaVersion: 1;
  phase: 'finalizing';
  audit: InstallationCleanupAudit;
}

export type InstallationStableCheckpoint =
  InstallationScanningCheckpoint | InstallationFinalizingCheckpoint;

export interface InstallationDeletingCheckpoint {
  schemaVersion: 1;
  phase: 'deleting';
  installationIds: number[];
  next: InstallationStableCheckpoint;
}

export type InstallationCleanupCheckpoint =
  InstallationStableCheckpoint | InstallationDeletingCheckpoint;

export function parseInstallationCleanupCheckpoint(
  value: string | null
): InstallationCleanupCheckpoint | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.schemaVersion !== 1) throw new Error('invalid schema');

    const stableCheckpoint = parseStableCheckpoint(parsed);
    if (stableCheckpoint) return stableCheckpoint;

    if (
      parsed.phase === 'deleting' &&
      Array.isArray(parsed.installationIds) &&
      parsed.installationIds.length > 0 &&
      parsed.installationIds.every(isInstallationId) &&
      parsed.next &&
      typeof parsed.next === 'object'
    ) {
      const next = parseStableCheckpoint(parsed.next as Record<string, unknown>);
      if (next) {
        return {
          schemaVersion: 1,
          phase: 'deleting',
          installationIds: parsed.installationIds,
          next,
        };
      }
    }

    throw new Error('invalid checkpoint fields');
  } catch {
    throw new Error('Malformed installation cleanup checkpoint');
  }
}

function parseStableCheckpoint(
  parsed: Record<string, unknown>
): InstallationStableCheckpoint | null {
  if (parsed.schemaVersion !== 1) return null;

  if (parsed.phase === 'finalizing' && isAudit(parsed.audit)) {
    return {
      schemaVersion: 1,
      phase: 'finalizing',
      audit: parsed.audit,
    };
  }

  if (
    parsed.phase === 'scanning' &&
    typeof parsed.cursor === 'string' &&
    parsed.cursor &&
    typeof parsed.startedAt === 'string' &&
    isCount(parsed.scannedCount) &&
    isCount(parsed.deletedCount) &&
    parsed.deletedCount <= parsed.scannedCount
  ) {
    return {
      schemaVersion: 1,
      phase: 'scanning',
      cursor: parsed.cursor,
      startedAt: parsed.startedAt,
      scannedCount: parsed.scannedCount,
      deletedCount: parsed.deletedCount,
    };
  }

  return null;
}

function isAudit(value: unknown): value is InstallationCleanupAudit {
  if (!value || typeof value !== 'object') return false;
  const audit = value as Record<string, unknown>;
  return (
    audit.schemaVersion === 1 &&
    typeof audit.completedAt === 'string' &&
    isCount(audit.scannedCount) &&
    isCount(audit.activeCount) &&
    isCount(audit.deletedCount) &&
    audit.deletedCount <= audit.scannedCount
  );
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isInstallationId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
