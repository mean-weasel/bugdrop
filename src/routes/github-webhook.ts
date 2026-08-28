import { Hono } from 'hono';
import type { Env } from '../types';
import {
  deleteInstallationRecord,
  verifyGitHubWebhookSignature,
} from '../lib/installation-retention';

const githubWebhook = new Hono<{ Bindings: Env }>();

githubWebhook.post('/github/webhook', async c => {
  const secret = c.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return c.json({ error: 'GitHub webhook is not configured' }, 503);
  }

  const body = await c.req.text();
  const signatureIsValid = await verifyGitHubWebhookSignature(
    secret,
    c.req.header('x-hub-signature-256'),
    body
  );
  if (!signatureIsValid) {
    return c.json({ error: 'Invalid webhook signature' }, 401);
  }

  const event = c.req.header('x-github-event');
  if (!event) {
    return c.json({ error: 'Missing GitHub event type' }, 400);
  }
  if (event !== 'installation') {
    return c.json({ accepted: true }, 202);
  }

  const payload = parseInstallationPayload(body);
  if (!payload) {
    return c.json({ error: 'Invalid installation webhook payload' }, 400);
  }
  if (payload.action !== 'deleted') {
    return c.json({ accepted: true }, 202);
  }

  const store = c.env.INSTALLATION_ANALYTICS;
  if (!store) {
    return c.json({ error: 'Installation deletion storage is unavailable' }, 503);
  }

  await deleteInstallationRecord(store, payload.installation.id);
  return c.json({ deleted: true }, 200);
});

function parseInstallationPayload(
  body: string
): { action: string; installation: { id: number } } | null {
  try {
    const payload = JSON.parse(body) as unknown;
    if (!payload || typeof payload !== 'object') return null;
    const candidate = payload as {
      action?: unknown;
      installation?: { id?: unknown };
    };
    const id = candidate.installation?.id;
    if (
      typeof candidate.action !== 'string' ||
      typeof id !== 'number' ||
      !Number.isSafeInteger(id) ||
      id <= 0
    ) {
      return null;
    }
    return { action: candidate.action, installation: { id } };
  } catch {
    return null;
  }
}

export default githubWebhook;
