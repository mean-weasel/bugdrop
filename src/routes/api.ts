import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, FeedbackPayload } from '../types';
import {
  getInstallationToken,
  createIssue,
  uploadScreenshotAsAsset,
  isRepoPublic,
} from '../lib/github';
import { rateLimit, rateLimitByRepo } from '../middleware/rateLimit';

const api = new Hono<{ Bindings: Env }>();

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

// Rate limit: 10 requests per 15 minutes per IP
api.use(
  '/feedback',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
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

  // Validate screenshot size
  const maxSizeMB = parseInt(c.env.MAX_SCREENSHOT_SIZE_MB || '5', 10);
  if (payload.screenshot) {
    const sizeBytes = (payload.screenshot.length * 3) / 4; // Base64 to bytes
    const sizeMB = sizeBytes / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      return c.json(
        {
          error: `Screenshot too large: ${sizeMB.toFixed(1)}MB exceeds ${maxSizeMB}MB limit`,
        },
        400
      );
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
    if (imageData && imageData.startsWith('data:image/')) {
      try {
        screenshotUrl = await uploadScreenshotAsAsset(token, owner, repo, imageData);
      } catch (error) {
        console.error('Failed to upload screenshot:', error);
        // Continue without screenshot rather than failing the whole submission
      }
    }

    // Build issue body
    const body = formatIssueBody(payload, screenshotUrl);

    // Check repo visibility (for UI to decide whether to show issue link)
    const isPublic = await isRepoPublic(token, owner, repo);

    // Map category to GitHub label
    const categoryLabels: Record<string, string> = {
      bug: 'bug',
      feature: 'enhancement',
      question: 'question',
    };
    const categoryLabel = payload.category ? categoryLabels[payload.category] || 'bug' : 'bug';

    // Create issue with category label
    const issue = await createIssue(token, owner, repo, payload.title, body, [
      categoryLabel,
      'bugdrop',
    ]);

    return c.json({
      success: true,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      isPublic,
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

/**
 * Format the issue body with markdown
 */
function formatIssueBody(payload: FeedbackPayload, screenshotDataUrl?: string): string {
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

  sections.push('');
  sections.push('</details>');
  sections.push('');
  sections.push('---');
  sections.push('*Submitted via [BugDrop](https://github.com/mean-weasel/bugdrop)*');

  return sections.join('\n');
}

export default api;
