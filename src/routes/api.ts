import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, FeedbackCategory, FeedbackPayload } from '../types';
import {
  getInstallationToken,
  createIssue,
  uploadScreenshotAsAsset,
  isRepoPublic,
  GitHubLabelError,
} from '../lib/github';
import { rateLimit, rateLimitByRepo } from '../middleware/rateLimit';

const api = new Hono<{ Bindings: Env }>();

const DEFAULT_CATEGORY_LABELS: Record<FeedbackCategory, string[]> = {
  bug: ['bug'],
  feature: ['enhancement'],
  question: ['question'],
};

const CATEGORY_KEYS: FeedbackCategory[] = ['bug', 'feature', 'question'];
const MAX_LABELS_PER_CATEGORY = 5;
// GitHub enforces a 50-char limit on label names; keep validation in lockstep
// so over-long configured labels surface as a clear local warning rather than
// going out, getting rejected, and triggering the GitHub-error fallback path.
const MAX_LABEL_LENGTH = 50;

// CORS middleware with origin whitelist
api.use('*', async (c, next) => {
  const allowedOrigins = c.env.ALLOWED_ORIGINS || '*';

  // Parse allowed origins
  const originList =
    allowedOrigins === '*'
      ? ['*']
      : allowedOrigins
          .split(',')
          .map(o => o.trim())
          .filter(Boolean);

  const corsMiddleware = cors({
    origin: origin => {
      // Allow requests with no origin (e.g., curl, server-to-server)
      if (!origin) return '*';
      // Wildcard allows all
      if (originList.includes('*')) return origin;
      // Check if origin is in whitelist
      return originList.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  });

  return corsMiddleware(c, next);
});

// Rate limit: 20 requests per 15 minutes per IP
api.use(
  '/feedback',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 20,
    keyPrefix: 'ip',
  })
);

// Rate limit: 50 requests per hour per repo
api.use(
  '/feedback',
  rateLimitByRepo({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50,
  })
);

// Health check
api.get('/health', c => {
  return c.json({
    status: 'ok',
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });
});

// Check if app is installed on repo
api.get('/check/:owner/:repo', async c => {
  const { owner, repo } = c.req.param();

  const token = await getInstallationToken(c.env, owner, repo);

  return c.json({
    installed: !!token,
    repo: `${owner}/${repo}`,
    appName: c.env.GITHUB_APP_NAME || undefined,
  });
});

// Submit feedback
api.post('/feedback', async c => {
  // Parse payload
  let payload: FeedbackPayload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  // Validate required fields (description is optional — many reports are title + screenshot)
  if (!payload.repo || !payload.title) {
    return c.json(
      {
        error: 'Missing required fields: repo, title',
      },
      400
    );
  }

  // Validate screenshot payload. The browser widget emits PNG data URLs, but
  // callers can hit the API directly, so the server must not trust the prefix.
  const maxSizeMB = parseInt(c.env.MAX_SCREENSHOT_SIZE_MB || '5', 10);
  if (payload.screenshot) {
    const validation = validateScreenshotDataUrl(payload.screenshot, maxSizeMB);
    if (!validation.valid) {
      return c.json({ error: validation.error }, 400);
    }
  }

  // Parse owner/repo
  const [owner, repo] = payload.repo.split('/');
  if (!owner || !repo) {
    return c.json(
      {
        error: 'Invalid repo format. Expected: owner/repo',
      },
      400
    );
  }

  try {
    // Get installation token
    const token = await getInstallationToken(c.env, owner, repo);
    if (!token) {
      const appName = c.env.GITHUB_APP_NAME || 'your-app-name';
      return c.json(
        {
          error: 'GitHub App not installed on this repository',
          installUrl: `https://github.com/apps/${appName}/installations/new`,
        },
        403
      );
    }

    // Upload screenshot as file and get URL
    let screenshotUrl: string | undefined;
    const imageData = payload.screenshot;
    if (imageData) {
      try {
        screenshotUrl = await uploadScreenshotAsAsset(token, owner, repo, imageData);
      } catch (error) {
        console.error('Failed to upload screenshot:', error);
        // Continue without screenshot rather than failing the whole submission
      }
    }

    const labelResolution = resolveCategoryLabels(payload, c.env, payload.repo);
    if (labelResolution.warnings.length > 0) {
      // Surface warnings in worker logs so self-host operators see the misconfig
      // even when no issue is filed. Otherwise these warnings only ever appear
      // in successfully-created issue bodies.
      console.warn('[BugDrop] Category label config warnings:', {
        repo: payload.repo,
        warnings: labelResolution.warnings,
      });
    }

    // Check repo visibility (for UI to decide whether to show issue link)
    const isPublic = await isRepoPublic(token, owner, repo);

    let body = formatIssueBody(payload, screenshotUrl, labelResolution.warnings);
    let issue;
    try {
      issue = await createIssue(token, owner, repo, payload.title, body, labelResolution.labels);
    } catch (error) {
      if (!labelResolution.usedCustomLabels || !(error instanceof GitHubLabelError)) {
        throw error;
      }

      const fallbackLabels = buildIssueLabels(getDefaultLabelsForCategory(payload.category));
      const warning = [
        ...labelResolution.warnings,
        `GitHub rejected the configured labels (${formatLabelList(labelResolution.labels)}), so BugDrop retried with default labels (${formatLabelList(fallbackLabels)}).`,
      ];
      body = formatIssueBody(payload, screenshotUrl, warning);
      try {
        issue = await createIssue(token, owner, repo, payload.title, body, fallbackLabels);
      } catch (fallbackError) {
        // Both configured AND default labels failed — surface a distinct error
        // so operators can tell this from a single-call failure. Without this,
        // the outer catch reports only the second error and loses the retry
        // context entirely.
        console.error('[BugDrop] Both configured and default labels failed.', {
          configured: labelResolution.labels,
          fallback: fallbackLabels,
          originalError: error,
          fallbackError,
        });
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(
          `Failed to create issue with both configured labels (${formatLabelList(labelResolution.labels)}) and default labels (${formatLabelList(fallbackLabels)}): ${fallbackMessage}`
        );
      }
    }

    return c.json({
      success: true,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      isPublic,
      ...(labelResolution.warnings.length > 0
        ? { labelMappingWarnings: labelResolution.warnings }
        : {}),
    });
  } catch (error) {
    console.error('Error creating feedback:', error);
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create issue',
      },
      500
    );
  }
});

type ScreenshotValidationResult = { valid: true } | { valid: false; error: string };
type LabelResolution = {
  labels: string[];
  warnings: string[];
  usedCustomLabels: boolean;
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function validateScreenshotDataUrl(dataUrl: string, maxSizeMB: number): ScreenshotValidationResult {
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) {
    return {
      valid: false,
      error: 'Invalid screenshot format. Expected a PNG data URL.',
    };
  }

  const base64 = match[1];
  if (!base64) {
    return {
      valid: false,
      error: 'Invalid screenshot format. Expected a PNG data URL.',
    };
  }

  const estimatedSizeBytes =
    Math.floor((base64.length * 3) / 4) -
    (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  const estimatedSizeMB = estimatedSizeBytes / (1024 * 1024);
  if (estimatedSizeMB > maxSizeMB) {
    return {
      valid: false,
      error: `Screenshot too large: ${estimatedSizeMB.toFixed(1)}MB exceeds ${maxSizeMB}MB limit`,
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(base64);
  } catch {
    return {
      valid: false,
      error: 'Invalid screenshot format. Expected valid base64 PNG data.',
    };
  }

  if (!hasPngSignature(bytes)) {
    return {
      valid: false,
      error: 'Invalid screenshot format. Expected PNG image data.',
    };
  }

  return { valid: true };
}

function resolveCategoryLabels(payload: FeedbackPayload, env: Env, repo: string): LabelResolution {
  const selectedCategory = isFeedbackCategory(payload.category) ? payload.category : 'bug';
  const labelsByCategory: Record<FeedbackCategory, string[]> = { ...DEFAULT_CATEGORY_LABELS };
  const warnings: string[] = [];
  const configuredLabels = getConfiguredCategoryLabels(payload, env, repo, warnings);
  let selectedCategoryWasCustomized = false;

  if (configuredLabels !== undefined) {
    for (const key of Object.keys(configuredLabels)) {
      if (!isFeedbackCategory(key)) {
        warnings.push(`Unknown category label mapping key ignored: \`${safeInlineCode(key)}\`.`);
        continue;
      }

      const normalized = normalizeLabelValue(configuredLabels[key], key);
      if (normalized.valid) {
        labelsByCategory[key] = normalized.labels;
        if (key === selectedCategory) {
          selectedCategoryWasCustomized = !sameLabels(
            normalized.labels,
            DEFAULT_CATEGORY_LABELS[selectedCategory]
          );
        }
      } else {
        warnings.push(normalized.warning);
      }
    }
  }

  return {
    labels: buildIssueLabels(labelsByCategory[selectedCategory]),
    warnings,
    usedCustomLabels: selectedCategoryWasCustomized,
  };
}

// Discriminated result of parsing CATEGORY_LABELS so the caller cannot conflate
// "env unset" with "env set but unusable" — the latter must fail closed even when
// ALLOW_CLIENT_CATEGORY_LABELS is true.
type EnvCategoryConfigResult =
  | { kind: 'unset' }
  | { kind: 'config'; value: Record<string, unknown> }
  | { kind: 'malformed'; warning: string }
  | { kind: 'invalid-shape'; warning: string }
  | { kind: 'no-match'; warning: string };

function getConfiguredCategoryLabels(
  payload: FeedbackPayload,
  env: Env,
  repo: string,
  warnings: string[]
): Record<string, unknown> | undefined {
  const envResult = parseEnvCategoryLabels(env.CATEGORY_LABELS, repo);

  switch (envResult.kind) {
    case 'config':
      return envResult.value;
    case 'malformed':
    case 'invalid-shape':
    case 'no-match':
      // Env was set but unusable — fail closed. Do NOT fall through to the
      // client mapping even when ALLOW_CLIENT_CATEGORY_LABELS=true: the operator
      // explicitly configured server authority, and a typo must not silently
      // hand label control back to the browser.
      warnings.push(envResult.warning);
      return undefined;
    case 'unset':
      if (env.ALLOW_CLIENT_CATEGORY_LABELS !== 'true') return undefined;
      if (payload.categoryLabels === undefined) return undefined;
      if (!isPlainObject(payload.categoryLabels)) {
        warnings.push('Invalid category label mapping: expected an object.');
        return undefined;
      }
      return payload.categoryLabels;
  }
}

function parseEnvCategoryLabels(
  rawValue: string | undefined,
  repo: string
): EnvCategoryConfigResult {
  if (!rawValue) return { kind: 'unset' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return { kind: 'malformed', warning: 'Invalid server category label config: malformed JSON.' };
  }

  if (!isPlainObject(parsed)) {
    return {
      kind: 'invalid-shape',
      warning: 'Invalid server category label config: expected a JSON object.',
    };
  }

  // Disambiguate flat vs per-repo by syntax, not by guessing: per-repo keys are
  // either the wildcard `*` or contain a `/` (owner/repo). Category keys never do.
  const isPerRepoShape = Object.keys(parsed).some(k => k === '*' || k.includes('/'));
  if (!isPerRepoShape) {
    return { kind: 'config', value: parsed };
  }

  const match = parsed[repo] ?? parsed['*'];
  if (match === undefined) {
    return {
      kind: 'no-match',
      warning: `Server category label config has no mapping for \`${safeInlineCode(repo)}\` and no \`*\` fallback.`,
    };
  }
  if (!isPlainObject(match)) {
    return {
      kind: 'invalid-shape',
      warning: `Invalid server category label config for \`${safeInlineCode(repo)}\`: expected an object.`,
    };
  }
  return { kind: 'config', value: match };
}

function getDefaultLabelsForCategory(category: FeedbackCategory | undefined): string[] {
  return DEFAULT_CATEGORY_LABELS[isFeedbackCategory(category) ? category : 'bug'];
}

function buildIssueLabels(categoryLabels: string[]): string[] {
  return uniqueLabels([...categoryLabels, 'bugdrop']);
}

function normalizeLabelValue(
  value: unknown,
  category: FeedbackCategory
): { valid: true; labels: string[] } | { valid: false; warning: string } {
  const rawLabels = typeof value === 'string' ? [value] : Array.isArray(value) ? value : null;
  if (!rawLabels) {
    return {
      valid: false,
      warning: `Invalid labels for category "${category}": expected a string or string array.`,
    };
  }

  if (rawLabels.length === 0 || rawLabels.length > MAX_LABELS_PER_CATEGORY) {
    return {
      valid: false,
      warning: `Invalid labels for category "${category}": expected 1-${MAX_LABELS_PER_CATEGORY} labels.`,
    };
  }

  const labels: string[] = [];
  for (const rawLabel of rawLabels) {
    if (typeof rawLabel !== 'string') {
      return {
        valid: false,
        warning: `Invalid labels for category "${category}": all labels must be strings.`,
      };
    }

    // Reject ASCII control characters (newlines, NUL, etc). A label like
    // "foo\n## Compromised" passes length validation but breaks out of the
    // inline-code span and injects markdown into the issue body.
    if (hasControlChars(rawLabel)) {
      return {
        valid: false,
        warning: `Invalid labels for category "${category}": labels cannot contain control characters.`,
      };
    }

    const label = rawLabel.trim();
    if (!label || label.length > MAX_LABEL_LENGTH) {
      return {
        valid: false,
        warning: `Invalid labels for category "${category}": labels must be 1-${MAX_LABEL_LENGTH} characters.`,
      };
    }
    labels.push(label);
  }

  return { valid: true, labels: uniqueLabels(labels) };
}

function uniqueLabels(labels: string[]): string[] {
  return Array.from(new Set(labels));
}

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function sameLabels(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((label, index) => label === right[index]);
}

function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return typeof value === 'string' && CATEGORY_KEYS.includes(value as FeedbackCategory);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatLabelList(labels: string[]): string {
  return labels.map(label => `\`${safeInlineCode(label)}\``).join(', ');
}

function safeInlineCode(value: string): string {
  return value.replace(/[`\\]/g, '');
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/**
 * Format the issue body with markdown
 */
function formatIssueBody(
  payload: FeedbackPayload,
  screenshotDataUrl?: string,
  labelWarnings: string[] = []
): string {
  const sections: string[] = [];

  // Submitter info (if provided)
  if (payload.submitter?.name || payload.submitter?.email) {
    sections.push('## Submitted by');
    const parts: string[] = [];
    if (payload.submitter.name) {
      parts.push(`**${payload.submitter.name}**`);
    }
    if (payload.submitter.email) {
      parts.push(`(${payload.submitter.email})`);
    }
    sections.push(parts.join(' '));
    sections.push('');
  }

  // Description
  if (payload.description) {
    sections.push('## Description');
    sections.push(payload.description);
    sections.push('');
  }

  // Screenshot - embedded as base64 data URL
  if (screenshotDataUrl) {
    sections.push('## Screenshot');
    sections.push(`![Screenshot](${screenshotDataUrl})`);
    if (payload.metadata.elementSelector) {
      sections.push('');
      sections.push('_Selected element is indicated by the blue rounded highlight box._');
    }
    sections.push('');
  }

  if (labelWarnings.length > 0) {
    sections.push('## Label mapping warning');
    for (const warning of labelWarnings) {
      sections.push(`- ${warning}`);
    }
    sections.push('');
  }

  // System Info
  sections.push('<details>');
  sections.push('<summary>System Info</summary>');
  sections.push('');
  sections.push('| Property | Value |');
  sections.push('|----------|-------|');

  // Browser and OS (if available)
  if (payload.metadata.browser) {
    const browserVersion = payload.metadata.browser.version
      ? ` ${payload.metadata.browser.version}`
      : '';
    sections.push(`| **Browser** | ${payload.metadata.browser.name}${browserVersion} |`);
  }

  if (payload.metadata.os) {
    const osVersion = payload.metadata.os.version ? ` ${payload.metadata.os.version}` : '';
    sections.push(`| **OS** | ${payload.metadata.os.name}${osVersion} |`);
  }

  // Viewport with pixel ratio
  const pixelRatio = payload.metadata.devicePixelRatio
    ? ` @${payload.metadata.devicePixelRatio}x`
    : '';
  sections.push(
    `| **Viewport** | ${payload.metadata.viewport.width}×${payload.metadata.viewport.height}${pixelRatio} |`
  );

  // Language
  if (payload.metadata.language) {
    sections.push(`| **Language** | ${payload.metadata.language} |`);
  }

  // URL (redacted)
  sections.push(`| **Page** | ${payload.metadata.url} |`);
  sections.push(`| **Timestamp** | ${payload.metadata.timestamp} |`);

  if (payload.metadata.elementSelector) {
    sections.push(`| **Element** | \`${payload.metadata.elementSelector}\` |`);
  }

  if (payload.metadata.fullElementSelector) {
    sections.push(`| **Full CSS path** | \`${payload.metadata.fullElementSelector}\` |`);
  }

  sections.push('');
  sections.push('</details>');
  sections.push('');
  sections.push('---');
  sections.push('*Submitted via [BugDrop](https://github.com/mean-weasel/bugdrop)*');

  return sections.join('\n');
}

export default api;
