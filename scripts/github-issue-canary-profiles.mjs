const REPO = 'mean-weasel/bugdrop-widget-test';

const PROFILES = Object.freeze({
  preview: Object.freeze({
    id: 'preview',
    repo: REPO,
    venueOrigin: 'https://bugdrop-widget-test-git-preview-jermwatts-projects.vercel.app',
    widgetOrigin: 'https://bugdrop-preview.neonwatty.workers.dev',
    titlePrefix: '[BugDrop CI canary]',
    markerPattern: /^bugdrop-ci-canary:[0-9]+:[0-9]+:[a-f0-9]{40}$/,
    variantId: 'merge-queue-canary',
    dialogTitle: 'Merge-queue canary',
  }),
  production: Object.freeze({
    id: 'production',
    repo: REPO,
    venueOrigin: 'https://bugdrop-widget-test.vercel.app',
    widgetOrigin: 'https://bugdrop.neonwatty.workers.dev',
    titlePrefix: '[BugDrop production heartbeat]',
    markerPattern: /^bugdrop-production-heartbeat:[0-9]+:[0-9]+:[a-f0-9]{40}$/,
    variantId: 'production-heartbeat',
    dialogTitle: 'Production heartbeat',
  }),
});

const CANARY_PROFILE_NAMES = Object.freeze(Object.keys(PROFILES));
export const PREVIEW_CANARY_PROFILE = PROFILES.preview;
export const PRODUCTION_CANARY_PROFILE = PROFILES.production;

export function getCanaryProfile(name) {
  const profile = PROFILES[name];
  if (!profile) {
    throw new Error(
      `Unknown canary profile: ${name || '(missing)'}; expected ${CANARY_PROFILE_NAMES.join(' or ')}`
    );
  }
  return profile;
}

export function validateCanarySelector({
  profile: profileName,
  repo,
  marker,
  prefix,
  expectedWorkerSha,
}) {
  const profile = getCanaryProfile(profileName);
  requireExact(repo, profile.repo, 'repo', profile.id);
  if (Boolean(marker) === Boolean(prefix)) {
    throw new Error('Exactly one of marker or prefix is required');
  }
  if (marker) {
    if (!profile.markerPattern.test(marker)) {
      throw new Error(`marker does not match the ${profile.id} canary profile`);
    }
    if (expectedWorkerSha !== undefined) {
      if (!/^[a-f0-9]{40}$/.test(expectedWorkerSha)) {
        throw new Error('expected Worker SHA must be a full lowercase Git SHA');
      }
      if (!marker.endsWith(`:${expectedWorkerSha}`)) {
        throw new Error(`marker does not end with the expected Worker SHA for ${profile.id}`);
      }
    }
    return { profile, marker };
  }
  requireExact(prefix, profile.titlePrefix, 'prefix', profile.id);
  return { profile, prefix };
}

export function resolveBrowserCanaryProfile({
  profile: profileName,
  repo,
  venueOrigin,
  widgetOrigin,
  marker,
  expectedWorkerSha,
}) {
  const profile = getCanaryProfile(profileName);
  requireExact(repo, profile.repo, 'repo', profile.id);
  requireExact(
    normalizeOrigin(venueOrigin, 'venue origin'),
    profile.venueOrigin,
    'venue origin',
    profile.id
  );
  requireExact(
    normalizeOrigin(widgetOrigin, 'widget origin'),
    profile.widgetOrigin,
    'widget origin',
    profile.id
  );
  if (!profile.markerPattern.test(marker)) {
    throw new Error(`marker does not match the ${profile.id} canary profile`);
  }
  if (!/^[a-f0-9]{40}$/.test(expectedWorkerSha)) {
    throw new Error('expected Worker SHA must be a full lowercase Git SHA');
  }
  if (!marker.endsWith(`:${expectedWorkerSha}`)) {
    throw new Error(`marker does not end with the expected Worker SHA for ${profile.id}`);
  }
  return profile;
}

function normalizeOrigin(value, field) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be an HTTPS origin`);
  }
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) {
    throw new Error(`${field} must be an HTTPS origin without a path or credentials`);
  }
  return value;
}

function requireExact(actual, expected, field, profile) {
  if (actual !== expected) {
    throw new Error(`${field} must equal ${expected} for the ${profile} canary profile`);
  }
}
