import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, type Page, type Request, type Route } from '@playwright/test';

import {
  getCanaryProfile,
  resolveBrowserCanaryProfile,
} from '../scripts/github-issue-canary-profiles.mjs';
import {
  assertExactPreviewWidgetResponse,
  waitForPreviewWidgetResponse,
} from './live-preview-widget';

type CanaryEnvironment = {
  baseUrl: string;
  expectedWidgetOrigin: string;
  expectedWidgetSha256: string;
  expectedWorkerSha: string;
  marker: string;
  resultFile: string;
  profile: {
    dialogTitle: string;
    repo: string;
    titlePrefix: string;
    variantId: string;
  };
};

type FeedbackResult = {
  success?: unknown;
  issueNumber?: unknown;
  issueUrl?: unknown;
};

export async function runIssueCanary(page: Page): Promise<void> {
  const environment = requireCanaryEnvironment();
  await installVercelBypass(page, environment.baseUrl);

  const widgetResponsePromise = waitForPreviewWidgetResponse(
    page,
    environment.expectedWidgetOrigin
  );
  await page.goto('/');
  const widgetSrc = await page.evaluate(() =>
    Array.from(document.scripts)
      .map(script => script.src)
      .find(src => new URL(src).pathname === '/widget.js')
  );
  expect(widgetSrc, 'The fixed venue must load widget.js').toBeTruthy();

  const widgetUrl = new URL(widgetSrc!);
  expect(widgetUrl.origin).toBe(environment.expectedWidgetOrigin);
  expect(widgetUrl.pathname).toBe('/widget.js');
  await assertExactPreviewWidgetResponse(
    await widgetResponsePromise,
    environment.expectedWidgetSha256
  );

  const feedbackPosts: Request[] = [];
  let canarySubmissionId: string | undefined;
  let rejectedRequest: string | undefined;
  await page.route('**/feedback', async route => {
    const outgoing = route.request();
    if (outgoing.method() !== 'POST') {
      await route.continue();
      return;
    }

    const outgoingUrl = new URL(outgoing.url());
    expect(outgoingUrl.origin).toBe(environment.expectedWidgetOrigin);
    expect(outgoingUrl.pathname).toBe('/api/feedback');
    feedbackPosts.push(outgoing);
    if (feedbackPosts.length > 1) {
      rejectedRequest = 'The widget attempted more than one feedback POST';
      await route.abort('blockedbyclient');
      return;
    }

    const payload = outgoing.postDataJSON() as Record<string, unknown>;
    expect(payload.submissionId).toEqual(expect.any(String));
    canarySubmissionId = String(payload.submissionId);
    expect(payload.repo).toBe(environment.profile.repo);
    expect(payload).toMatchObject({
      kind: 'bugdrop.variant-submission',
      schemaVersion: 1,
      repo: environment.profile.repo,
      variantId: environment.profile.variantId,
      issue: {
        title: `${environment.profile.titlePrefix} ${environment.marker}`,
        classification: 'bug',
        sections: [{ heading: 'Canary marker', value: environment.marker, format: 'text' }],
      },
    });
    expect(payload).not.toHaveProperty('labels');
    expect(payload).not.toHaveProperty('labelSet');
    expect(payload).not.toHaveProperty('screenshot');
    expect(payload).not.toHaveProperty('fields');
    await route.continue();
  });

  const feedbackResponsePromise = page.waitForResponse(response => {
    const responseUrl = new URL(response.url());
    return (
      response.request().method() === 'POST' &&
      responseUrl.origin === environment.expectedWidgetOrigin &&
      responseUrl.pathname === '/api/feedback'
    );
  });
  await openRenderedCanary(page, environment);
  const canaryHost = page.locator('body > [data-bugdrop-owned]');
  await expect(
    canaryHost.getByRole('dialog', { name: environment.profile.dialogTitle })
  ).toBeVisible();
  const markerInput = canaryHost.getByRole('textbox', { name: 'Marker' });
  await markerInput.fill(environment.marker);
  await expect(markerInput).toHaveValue(environment.marker);
  expect(feedbackPosts).toHaveLength(0);
  await canaryHost.getByRole('button', { name: 'Create canary Issue' }).click();

  const result = await readRenderedResult(page);
  const feedbackResponse = await feedbackResponsePromise;
  const feedbackUrl = new URL(feedbackResponse.url());
  expect(feedbackUrl.origin).toBe(environment.expectedWidgetOrigin);
  expect(feedbackUrl.pathname).toBe('/api/feedback');
  expect(feedbackResponse.status()).toBe(200);
  expect(feedbackResponse.headers()['x-bugdrop-build-sha']).toBe(environment.expectedWorkerSha);
  const responseResult = (await feedbackResponse.json()) as FeedbackResult;
  expect(responseResult.success).toBe(true);
  expect(result.issueNumber).toBe(responseResult.issueNumber);
  expect(result.issueUrl).toBe(responseResult.issueUrl);
  expect(
    Number.isInteger(responseResult.issueNumber) && Number(responseResult.issueNumber) > 0
  ).toBe(true);
  const issueNumber = Number(responseResult.issueNumber);
  const issueUrl = `https://github.com/${environment.profile.repo}/issues/${issueNumber}`;
  expect(responseResult.issueUrl).toBe(issueUrl);

  await page.waitForTimeout(1_000);
  expect(rejectedRequest).toBeUndefined();
  expect(feedbackPosts).toHaveLength(1);
  expect(canarySubmissionId).toMatch(/^submission-/);
  await mkdir(dirname(environment.resultFile), { recursive: true });
  await writeFile(
    environment.resultFile,
    `${JSON.stringify({
      marker: environment.marker,
      kind: 'structured',
      presentation: 'modal',
      submissionId: canarySubmissionId,
      issueNumber,
      issueUrl,
      workerSha: environment.expectedWorkerSha,
    })}\n`,
    { encoding: 'utf8', flag: 'wx' }
  );
}

function requireCanaryEnvironment(): CanaryEnvironment {
  if (process.env.BUGDROP_CANARY_GITHUB_TOKEN) {
    throw new Error('BUGDROP_CANARY_GITHUB_TOKEN must never be available to Playwright');
  }
  const profileName = requireEnvironment('LIVE_TARGET');
  const baseUrl = requireEnvironment('PLAYWRIGHT_BASE_URL');
  const expectedWidgetOrigin = requireEnvironment('EXPECTED_WIDGET_ORIGIN');
  const expectedWidgetSha256 = requireEnvironment('EXPECTED_WIDGET_SHA256');
  const expectedWorkerSha = requireEnvironment('EXPECTED_WORKER_SHA');
  const marker = requireEnvironment('BUGDROP_CANARY_MARKER');
  const resultFile = requireEnvironment('BUGDROP_CANARY_RESULT_FILE');
  const profile = resolveBrowserCanaryProfile({
    profile: profileName,
    repo: getCanaryProfile(profileName, process.env).repo,
    venueOrigin: new URL(baseUrl).origin,
    widgetOrigin: expectedWidgetOrigin,
    marker,
    expectedWorkerSha,
    environment: process.env,
  });
  if (new URL(baseUrl).origin !== baseUrl) {
    throw new Error('PLAYWRIGHT_BASE_URL must be an origin without a path');
  }
  if (!/^[a-f0-9]{64}$/.test(expectedWidgetSha256)) {
    throw new Error('EXPECTED_WIDGET_SHA256 must be a lowercase SHA-256 digest');
  }
  if (!/^[a-f0-9]{40}$/.test(expectedWorkerSha)) {
    throw new Error('EXPECTED_WORKER_SHA must be a full lowercase Git SHA');
  }
  return {
    baseUrl,
    expectedWidgetOrigin,
    expectedWidgetSha256,
    expectedWorkerSha,
    marker,
    resultFile,
    profile,
  };
}

async function openRenderedCanary(page: Page, environment: CanaryEnvironment): Promise<void> {
  await page.evaluate(
    ({ dialogTitle, titlePrefix, variantId }) => {
      if (!window.BugDrop) throw new Error('BugDrop API is unavailable');
      const handle = window.BugDrop.registerVariant({
        id: variantId,
        presentation: { kind: 'modal', size: 'compact' },
        content: { title: dialogTitle, submitLabel: 'Create canary Issue' },
        fields: [{ id: 'marker', type: 'longText', label: 'Marker', required: true }],
        issue: {
          classification: 'bug',
          title: `${titlePrefix} {{marker}}`,
          sections: [{ heading: 'Canary marker', field: 'marker' }],
        },
      });
      const opened = handle.open({ context: { canary: true } });
      (window as Window & { __bugdropCanaryOpened?: typeof opened }).__bugdropCanaryOpened = opened;
    },
    {
      dialogTitle: environment.profile.dialogTitle,
      titlePrefix: environment.profile.titlePrefix,
      variantId: environment.profile.variantId,
    }
  );
}

async function readRenderedResult(page: Page): Promise<{ issueNumber: number; issueUrl: string }> {
  return page.evaluate(async () => {
    const opened = (
      window as Window & {
        __bugdropCanaryOpened?: {
          result: Promise<
            | {
                status: 'submitted';
                result: { issueNumber: number; issueUrl: string; isPublic: boolean };
              }
            | { status: 'closed' | 'busy' }
          >;
        };
      }
    ).__bugdropCanaryOpened;
    if (!opened) throw new Error('Rendered canary modal handle is unavailable');
    const outcome = await opened.result;
    if (outcome.status !== 'submitted') {
      throw new Error(`Rendered canary ended with ${outcome.status}`);
    }
    return outcome.result;
  });
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the Issue canary`);
  return value;
}

async function installVercelBypass(page: Page, venueOrigin: string): Promise<void> {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!bypassSecret) return;
  await page.route('**/*', async route => {
    await routeVenueRequest(route, venueOrigin, bypassSecret);
  });
}

export function isVenueRequest(requestUrl: string, venueOrigin: string): boolean {
  return new URL(requestUrl).origin === venueOrigin;
}

export async function routeVenueRequest(
  route: Route,
  venueOrigin: string,
  bypassSecret: string
): Promise<void> {
  if (!isVenueRequest(route.request().url(), venueOrigin)) {
    await route.fallback();
    return;
  }
  await route.continue({
    headers: {
      ...route.request().headers(),
      'x-vercel-protection-bypass': bypassSecret,
    },
  });
}
