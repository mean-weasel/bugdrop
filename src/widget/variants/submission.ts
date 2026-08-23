import { getAuthHeaders, type BugDropAuthTokenProvider } from '../auth-token';
import type { HeadlessSubmitOptions, SubmissionResult, VariantConfig } from './public-types';
import { compileIssueDraft } from './issue-draft';

export interface VariantTransportConfig {
  repo: string;
  apiUrl: string;
  authTokenProvider?: BugDropAuthTokenProvider;
  appVersion?: string;
}

export async function submitVariant(
  transport: VariantTransportConfig,
  config: Readonly<VariantConfig>,
  answers: Record<string, unknown>,
  options: HeadlessSubmitOptions = {}
): Promise<SubmissionResult> {
  const submissionId = options.submissionId ?? createSubmissionId();
  const issue = compileIssueDraft(config, answers, options.context);
  const response = await fetch(`${transport.apiUrl}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await getAuthHeaders(transport.authTokenProvider)),
    },
    body: JSON.stringify({
      kind: 'bugdrop.variant-submission',
      schemaVersion: 1,
      repo: transport.repo,
      variantId: config.id,
      submissionId,
      issue,
      metadata: collectMetadata(transport.appVersion),
    }),
  });
  const result = (await response.json()) as Record<string, unknown>;
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
