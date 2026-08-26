import { getAuthHeaders, type BugDropAuthTokenProvider } from '../auth-token';
import type { HeadlessSubmitOptions, SubmissionResult, VariantConfig } from './public-types';
import { compileIssueDraft } from './issue-draft';

export interface VariantTransportConfig {
  repo: string;
  apiUrl: string;
  authTokenProvider?: BugDropAuthTokenProvider;
  appVersion?: string;
}

const LEGACY_APP_VERSION_ERROR = 'Unknown structured metadata property: appVersion';
const APP_VERSION_CAPABILITY_TIMEOUT_MS = 1500;

const appVersionCapabilityProbes = new Map<string, Promise<boolean>>();

export async function submitVariant(
  transport: VariantTransportConfig,
  config: Readonly<VariantConfig>,
  answers: Record<string, unknown>,
  options: HeadlessSubmitOptions = {}
): Promise<SubmissionResult> {
  const submissionId = options.submissionId ?? createSubmissionId();
  const issue = compileIssueDraft(config, answers, options.context);
  const headers = {
    'Content-Type': 'application/json',
    ...(await getAuthHeaders(transport.authTokenProvider)),
  };
  const appVersion = await resolveAppVersion(transport);
  const metadata = collectMetadata(appVersion);
  const payload = {
    kind: 'bugdrop.variant-submission',
    schemaVersion: 1,
    repo: transport.repo,
    variantId: config.id,
    submissionId,
    issue,
    metadata,
  };
  let response = await postVariantSubmission(transport.apiUrl, headers, payload);
  let result = (await response.json()) as Record<string, unknown>;
  if (
    appVersion !== undefined &&
    response.status === 400 &&
    !response.ok &&
    result.error === LEGACY_APP_VERSION_ERROR
  ) {
    console.warn('[BugDrop] Worker does not support app-version metadata; retrying without it.');
    response = await postVariantSubmission(transport.apiUrl, headers, {
      ...payload,
      metadata: { ...metadata, appVersion: undefined },
    });
    result = (await response.json()) as Record<string, unknown>;
  }
  if (!response.ok || result.success !== true) {
    throw new Error(typeof result.error === 'string' ? result.error : 'Failed to submit feedback');
  }
  if (
    !Number.isInteger(result.issueNumber) ||
    (result.issueNumber as number) <= 0 ||
    typeof result.issueUrl !== 'string' ||
    !isCanonicalIssueUrl(result.issueUrl, transport.repo, result.issueNumber as number) ||
    typeof result.isPublic !== 'boolean'
  ) {
    throw new Error('BugDrop received an invalid Issue result');
  }
  return {
    issueNumber: result.issueNumber as number,
    issueUrl: result.issueUrl,
    isPublic: result.isPublic,
    ...(Array.isArray(result.labelMappingWarnings) &&
    result.labelMappingWarnings.every(value => typeof value === 'string')
      ? { labelMappingWarnings: result.labelMappingWarnings as string[] }
      : {}),
  };
}

function postVariantSubmission(
  apiUrl: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>
): Promise<Response> {
  return fetch(`${apiUrl}/feedback`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

async function resolveAppVersion(transport: VariantTransportConfig): Promise<string | undefined> {
  if (transport.appVersion === undefined) return undefined;
  return (await workerSupportsAppVersion(transport.apiUrl)) ? transport.appVersion : undefined;
}

async function workerSupportsAppVersion(apiUrl: string): Promise<boolean> {
  const inFlight = appVersionCapabilityProbes.get(apiUrl);
  if (inFlight) return inFlight;

  const probe = probeAppVersionCapability(apiUrl).then(supported => supported === true);
  appVersionCapabilityProbes.set(apiUrl, probe);
  try {
    return await probe;
  } finally {
    if (appVersionCapabilityProbes.get(apiUrl) === probe) {
      appVersionCapabilityProbes.delete(apiUrl);
    }
  }
}

async function probeAppVersionCapability(apiUrl: string): Promise<boolean | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APP_VERSION_CAPABILITY_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiUrl}/health`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(
        `[BugDrop] App-version capability probe returned HTTP ${response.status}; submitting without it.`
      );
      return undefined;
    }
    const health: unknown = await response.json();
    if (!isRecord(health) || health.status !== 'ok') {
      console.warn(
        '[BugDrop] App-version capability probe returned an invalid response; submitting without it.'
      );
      return undefined;
    }
    if (health.capabilities === undefined) return false;
    if (
      !isRecord(health.capabilities) ||
      typeof health.capabilities.appVersionMetadata !== 'boolean'
    ) {
      console.warn(
        '[BugDrop] App-version capability probe returned an invalid response; submitting without it.'
      );
      return undefined;
    }
    return health.capabilities.appVersionMetadata;
  } catch (error) {
    console.warn('[BugDrop] App-version capability probe failed; submitting without it.', error);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createSubmissionId(): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto?.getRandomValues !== 'function') {
    throw new Error('BugDrop variants require a cryptographically secure random generator');
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function collectMetadata(appVersion?: string) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return {
    url: url.toString(),
    userAgent: navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    timestamp: new Date().toISOString(),
    appVersion,
    browser: parseBrowser(navigator.userAgent),
    os: parseOS(navigator.userAgent),
    devicePixelRatio: window.devicePixelRatio,
    language: navigator.language,
  };
}

function parseBrowser(userAgent: string): { name: string; version: string } {
  for (const [name, pattern] of [
    ['Edge', /Edg\/(\d+[\d.]*)/],
    ['Chrome', /Chrome\/(\d+[\d.]*)/],
    ['Safari', /Version\/(\d+[\d.]*).*Safari/],
    ['Firefox', /Firefox\/(\d+[\d.]*)/],
  ] as const) {
    const match = userAgent.match(pattern);
    if (match) return { name, version: match[1] ?? 'unknown' };
  }
  return { name: 'Unknown', version: 'unknown' };
}

function parseOS(userAgent: string): { name: string; version: string } {
  const match = userAgent.match(/(?:Mac OS X|Windows NT|Android) ([\d_.]+)/);
  if (match) {
    const name = userAgent.includes('Mac OS X')
      ? 'macOS'
      : userAgent.includes('Windows NT')
        ? 'Windows'
        : 'Android';
    return { name, version: (match[1] ?? 'unknown').replaceAll('_', '.') };
  }
  return { name: userAgent.includes('Linux') ? 'Linux' : 'Unknown', version: 'unknown' };
}

function isCanonicalIssueUrl(url: string, repo: string, issueNumber: number): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'github.com' &&
      parsed.pathname.toLowerCase() === `/${repo}/issues/${issueNumber}`.toLowerCase() &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}
