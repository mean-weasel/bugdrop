import { getAuthHeaders, type BugDropAuthTokenProvider } from '../auth-token';
import { getConsoleLogSnapshot } from '../console-logs';
import { getDomNodeCount, isFullPageDisabled } from '../screenshot';
import type { SubmissionResult } from '../variants/public-types';
import type { CaptureEvidence } from './runtime';
import type { FlowConfig, FlowScalar } from './public-types';
import { compileFlowIssueDraft } from './issue-draft';

export interface FlowTransportConfig {
  repo: string;
  apiUrl: string;
  authTokenProvider?: BugDropAuthTokenProvider;
  categoryLabels?: Partial<Record<'bug' | 'feature' | 'question', string | string[]>>;
}

export async function submitFlow(
  transport: FlowTransportConfig,
  config: Readonly<FlowConfig>,
  answers: Readonly<Record<string, unknown>>,
  context: Readonly<Record<string, FlowScalar>>,
  capture: CaptureEvidence | null
): Promise<SubmissionResult> {
  const issue = compileFlowIssueDraft(config, answers, context);
  const attachmentsPath = config.evidence?.attachments;
  const logsPath = config.evidence?.sendConsoleLogs;
  const namePath = config.evidence?.submitter?.name;
  const emailPath = config.evidence?.submitter?.email;
  const submitter =
    namePath || emailPath
      ? { name: readString(answers[namePath ?? '']), email: readString(answers[emailPath ?? '']) }
      : undefined;
  const response = await fetch(`${transport.apiUrl}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await getAuthHeaders(transport.authTokenProvider)),
    },
    body: JSON.stringify({
      repo: transport.repo,
      title: issue.title,
      description: issue.description,
      category: issue.category,
      categoryLabels: transport.categoryLabels,
      screenshot: capture?.screenshot ?? null,
      attachments: attachmentsPath ? (answers[attachmentsPath] ?? []) : [],
      consoleLogs: logsPath && answers[logsPath] === true ? getConsoleLogSnapshot() : undefined,
      submitter: submitter && (submitter.name || submitter.email) ? submitter : undefined,
      metadata: collectMetadata(capture),
    }),
  });
  if (response.status === 429) throw new Error('Too many submissions. Please try again later.');
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok || result.success !== true)
    throw new Error(typeof result.error === 'string' ? result.error : 'Failed to submit feedback');
  if (
    !Number.isInteger(result.issueNumber) ||
    (result.issueNumber as number) <= 0 ||
    typeof result.issueUrl !== 'string' ||
    typeof result.isPublic !== 'boolean' ||
    !isCanonicalIssueUrl(result.issueUrl, transport.repo, result.issueNumber as number)
  )
    throw new Error('BugDrop received an invalid Issue result');
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

function isCanonicalIssueUrl(value: string, repo: string, issueNumber: number): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === 'https://github.com' &&
      url.pathname === `/${repo}/issues/${issueNumber}` &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function collectMetadata(capture: CaptureEvidence | null) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return {
    url: url.toString(),
    userAgent: navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    timestamp: new Date().toISOString(),
    elementSelector: capture?.elementSelector ?? null,
    fullElementSelector: capture?.fullElementSelector ?? null,
    domNodeCount: getDomNodeCount(),
    fullPageDisabled: isFullPageDisabled(),
    devicePixelRatio: window.devicePixelRatio,
    language: navigator.language,
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
