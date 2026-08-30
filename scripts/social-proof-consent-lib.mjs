import { createHmac, timingSafeEqual } from 'node:crypto';

const STATUS_VALUES = new Set(['contacted', 'declined', 'approved', 'withdrawn']);

export function validateRegistry(value) {
  if (!isObject(value) || !hasExactKeys(value, ['schemaVersion', 'entries'])) {
    throw new Error('Invalid consent registry');
  }
  if (value.schemaVersion !== 1 || !Array.isArray(value.entries)) {
    throw new Error('Invalid consent registry');
  }

  const fingerprints = new Set();
  for (const entry of value.entries) {
    validateRegistryEntry(entry);
    if (fingerprints.has(entry.accountFingerprint)) {
      throw new Error('Duplicate consent registry entry');
    }
    fingerprints.add(entry.accountFingerprint);
  }
  return value;
}

export function buildCandidateReview(
  records,
  registry,
  excludedLogins,
  fingerprintKey,
  generatedAt = new Date().toISOString()
) {
  validateRegistry(registry);
  assertIsoDate(generatedAt);
  if (!Array.isArray(excludedLogins) || excludedLogins.length === 0) {
    throw new Error('At least one owned or test account must be excluded');
  }
  const excluded = new Set(excludedLogins.map(normalizeGitHubLogin));
  const decided = registry.entries.map(entry => Buffer.from(entry.accountFingerprint, 'hex'));
  const candidates = records
    .map(validateInstallationRecord)
    .map(record => ({
      ...record,
      accountFingerprint: fingerprintAccount(record.account.login, fingerprintKey),
    }))
    .filter(
      record =>
        !excluded.has(record.account.login.toLocaleLowerCase('en-US')) &&
        !decided.some(value =>
          timingSafeEqual(value, Buffer.from(record.accountFingerprint, 'hex'))
        )
    )
    .sort((a, b) => a.installedAt.localeCompare(b.installedAt));

  return { schemaVersion: 1, generatedAt, candidates };
}

export function buildApprovedExport(registry, generatedAt = new Date().toISOString()) {
  validateRegistry(registry);
  assertIsoDate(generatedAt);
  const apps = registry.entries
    .filter(entry => entry.status === 'approved')
    .map(entry => ({ ...entry.approval.publicProfile }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { schemaVersion: 1, generatedAt, apps };
}

export function fingerprintAccount(login, fingerprintKey) {
  const normalized = normalizeGitHubLogin(login);
  const key = validateFingerprintKey(fingerprintKey);
  return createHmac('sha256', key).update(normalized, 'utf8').digest('hex');
}

export function validateFingerprintKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error('Invalid social proof fingerprint key');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== 32) throw new Error('Invalid social proof fingerprint key');
  return decoded;
}

function validateRegistryEntry(entry) {
  if (!isObject(entry) || !STATUS_VALUES.has(entry.status)) {
    throw new Error('Invalid consent registry entry');
  }
  assertFingerprint(entry.accountFingerprint);
  assertIsoDate(entry.updatedAt);

  const expected =
    entry.status === 'approved'
      ? ['accountFingerprint', 'status', 'updatedAt', 'approval']
      : ['accountFingerprint', 'status', 'updatedAt'];
  if (!hasExactKeys(entry, expected)) throw new Error('Invalid consent registry entry');
  if (entry.status === 'approved') validateApproval(entry.approval);
}

function validateApproval(approval) {
  if (
    !isObject(approval) ||
    !hasExactKeys(approval, [
      'approvedAt',
      'authorizedRepresentativeConfirmed',
      'evidenceReference',
      'publicProfile',
    ]) ||
    approval.authorizedRepresentativeConfirmed !== true ||
    typeof approval.evidenceReference !== 'string' ||
    approval.evidenceReference.trim() === ''
  ) {
    throw new Error('Invalid social proof approval');
  }
  assertIsoDate(approval.approvedAt);
  validatePublicProfile(approval.publicProfile);
}

function validatePublicProfile(profile) {
  if (!isObject(profile)) throw new Error('Invalid approved public profile');
  const allowed = ['displayName', 'url', 'logoUrl', 'quote', 'attribution'];
  const keys = Object.keys(profile);
  if (
    !keys.includes('displayName') ||
    !keys.includes('url') ||
    keys.some(key => !allowed.includes(key))
  ) {
    throw new Error('Invalid approved public profile');
  }
  for (const key of keys) {
    if (typeof profile[key] !== 'string' || profile[key].trim() === '') {
      throw new Error('Invalid approved public profile');
    }
  }
  assertHttpsUrl(profile.url);
  if (profile.logoUrl) assertHttpsUrl(profile.logoUrl);
}

function validateInstallationRecord(record) {
  if (
    !isObject(record) ||
    !hasExactKeys(record, ['schemaVersion', 'installationId', 'account', 'installedAt']) ||
    record.schemaVersion !== 1 ||
    !isObject(record.account) ||
    !hasExactKeys(record.account, ['login', 'type', 'profileUrl']) ||
    typeof record.account.login !== 'string' ||
    !['User', 'Organization'].includes(record.account.type)
  ) {
    throw new Error('Invalid installation record');
  }
  normalizeGitHubLogin(record.account.login);
  assertPositiveInteger(record.installationId);
  assertIsoDate(record.installedAt);
  const expectedUrl = `https://github.com/${record.account.login}`;
  if (![expectedUrl, `${expectedUrl}/`].includes(record.account.profileUrl)) {
    throw new Error('Invalid installation record');
  }
  return record;
}

function normalizeGitHubLogin(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/.test(value)) {
    throw new Error('Invalid GitHub account');
  }
  return value.toLocaleLowerCase('en-US');
}

function hasExactKeys(value, expected) {
  return Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertFingerprint(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('Invalid account fingerprint');
  }
}

function assertPositiveInteger(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid installation ID');
}

function assertIsoDate(value) {
  if (
    typeof value !== 'string' ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error('Invalid timestamp');
  }
}

function assertHttpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Invalid public URL');
  }
}
