#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { canonicalHash } from './release/canonical-json.mjs';

const TAG_PATTERN = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const IDENTITY_PATTERN = /^sha256:[0-9a-f]{64}$/;

export class DiscordReleaseError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'DiscordReleaseError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new DiscordReleaseError(code, message, details);
}

function text(value, field, { required = false, max = 2000 } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') fail('INVALID_INPUT', `${field} must be text`);
  const normalized = value.replace(/\r\n?/g, '\n').normalize('NFC').trim();
  if (required && !normalized) fail('INVALID_INPUT', `${field} is required`);
  if (normalized.length > max) fail('INVALID_INPUT', `${field} exceeds ${max} characters`);
  return normalized;
}

function httpsUrl(value, field, { required = false } = {}) {
  const normalized = text(value, field, { required, max: 2048 });
  if (!normalized) return '';
  let url;
  try {
    url = new URL(normalized);
  } catch {
    fail('INVALID_INPUT', `${field} must be an HTTPS URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    fail('INVALID_INPUT', `${field} must be an HTTPS URL without credentials`);
  }
  return normalized;
}

export function normalizeNotificationRequest(input) {
  const repository = text(input?.repository, 'repository', { required: true, max: 200 });
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    fail('INVALID_INPUT', 'repository must be owner/name');
  }
  const tag = text(input.tag, 'tag', { required: true, max: 64 });
  if (!TAG_PATTERN.test(tag)) fail('INVALID_INPUT', 'tag must be stable vMAJOR.MINOR.PATCH');
  if (typeof input.automatic !== 'boolean' || typeof input.dryRun !== 'boolean') {
    fail('INVALID_INPUT', 'automatic and dryRun must be booleans');
  }
  const releasePlanIdentity = text(input.releasePlanIdentity, 'releasePlanIdentity', { max: 80 });
  if (input.automatic && !IDENTITY_PATTERN.test(releasePlanIdentity)) {
    fail('INVALID_RELEASE_PLAN_IDENTITY', 'automatic notification requires release-plan identity');
  }
  if (releasePlanIdentity && !IDENTITY_PATTERN.test(releasePlanIdentity)) {
    fail('INVALID_RELEASE_PLAN_IDENTITY', 'releasePlanIdentity is invalid');
  }
  const mentionUserId = text(input.mentionUserId, 'mentionUserId', { max: 32 });
  if (mentionUserId && !/^\d{5,32}$/.test(mentionUserId)) {
    fail('INVALID_INPUT', 'mentionUserId must contain only Discord snowflake digits');
  }
  const identity = {
    releasePlanIdentity: releasePlanIdentity || null,
    repository,
    tag,
  };
  return {
    automatic: input.automatic,
    dryRun: input.dryRun,
    imageUrl: httpsUrl(input.imageUrl, 'imageUrl'),
    mentionUserId,
    message: text(input.message, 'message', { max: 1000 }),
    notificationKey: canonicalHash(identity),
    releasePlanIdentity: identity.releasePlanIdentity,
    repository,
    tag,
  };
}

function normalizeRelease(release, request) {
  if (release?.tag_name !== request.tag)
    fail('RELEASE_MISMATCH', 'release tag does not match request');
  const url = httpsUrl(release.html_url, 'release.html_url', { required: true });
  if (!url.startsWith(`https://github.com/${request.repository}/releases/`)) {
    fail('RELEASE_MISMATCH', 'release URL does not belong to requested repository');
  }
  return {
    author: text(release.author?.login, 'release.author', { max: 100 }) || 'GitHub',
    body: text(release.body, 'release.body', { max: 100000 }),
    name: text(release.name, 'release.name', { max: 250 }) || request.tag,
    publishedAt: text(release.published_at, 'release.published_at', { required: true, max: 40 }),
    url,
  };
}

export function buildDiscordPayload(releaseInput, requestInput) {
  const request = requestInput.notificationKey
    ? requestInput
    : normalizeNotificationRequest(requestInput);
  const release = normalizeRelease(releaseInput, request);
  const maximum = 3500;
  const description =
    release.body.length > maximum
      ? `${release.body.slice(0, maximum - 3).trimEnd()}...`
      : release.body || 'Release notes are available on GitHub.';
  const mention = request.mentionUserId ? `<@${request.mentionUserId}>` : '';
  const content = (request.message || `BugDrop ${request.tag} is out.`).replaceAll(
    '{mention}',
    mention
  );
  const embed = {
    color: 0x238636,
    description,
    fields: [
      { inline: true, name: 'Repository', value: request.repository },
      { inline: true, name: 'Tag', value: `\`${request.tag}\`` },
    ],
    footer: { text: `Published by ${release.author}` },
    timestamp: release.publishedAt,
    title: release.name,
    url: release.url,
    ...(request.imageUrl ? { image: { url: request.imageUrl } } : {}),
  };
  return {
    allowed_mentions: { parse: [], users: request.mentionUserId ? [request.mentionUserId] : [] },
    content,
    embeds: [embed],
    username: 'GitHub Releases',
  };
}

export function resolveNotificationAttempt({ request, completedKeys = [] }) {
  if (!Array.isArray(completedKeys)) fail('INVALID_INPUT', 'completedKeys must be an array');
  if (request.automatic && completedKeys.includes(request.notificationKey)) {
    return { status: 'duplicate', notificationKey: request.notificationKey };
  }
  return { status: 'send', notificationKey: request.notificationKey };
}

export async function sendDiscordNotification({ webhookUrl, payload, fetchImpl = fetch }) {
  if (!webhookUrl) fail('MISSING_WEBHOOK', 'Discord webhook is required for a real send');
  const normalized = httpsUrl(webhookUrl, 'webhookUrl', { required: true });
  const url = new URL(normalized);
  if (url.hostname !== 'discord.com' || !url.pathname.startsWith('/api/webhooks/')) {
    fail('INVALID_WEBHOOK', 'webhookUrl must be a discord.com API webhook');
  }
  const response = await fetchImpl(normalized, {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    redirect: 'error',
  });
  if (!response.ok) {
    const responseBody = (await response.text()).replace(/\r\n?/g, '\n').slice(0, 200);
    fail('WEBHOOK_FAILED', `Discord webhook returned ${response.status}`, { responseBody });
  }
  return { status: 'sent' };
}

export async function executeDiscordNotification({
  request,
  release,
  webhookUrl,
  fetchImpl = fetch,
  completedKeys = [],
}) {
  const payload = buildDiscordPayload(release, request);
  if (request.dryRun)
    return { status: 'dry-run', notificationKey: request.notificationKey, payload };
  const attempt = resolveNotificationAttempt({ request, completedKeys });
  if (attempt.status === 'duplicate') return attempt;
  try {
    await sendDiscordNotification({ webhookUrl, payload, fetchImpl });
  } catch (error) {
    if (!(error instanceof DiscordReleaseError)) throw error;
    const retryInstruction = `Retry workflow_dispatch for tag ${request.tag} with automatic=false and dry_run=false.`;
    throw new DiscordReleaseError(
      'NOTIFICATION_SEND_FAILED',
      `Notification failed for ${request.tag}. ${retryInstruction}`,
      { causeCode: error.code, retryInstruction, tag: request.tag }
    );
  }
  return { status: 'sent', notificationKey: request.notificationKey, releaseUrl: release.html_url };
}

export async function fetchReleaseByTag({ repository, tag, token, fetchImpl = fetch }) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'bugdrop-discord-release-workflow',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const url = `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`;
  const response = await fetchImpl(url, { headers, redirect: 'error' });
  if (!response.ok)
    fail('RELEASE_LOOKUP_FAILED', `GitHub release lookup returned ${response.status}`);
  return response.json();
}

function booleanEnvironment(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  fail('INVALID_INPUT', `${name} must be true or false`);
}

function requestFromEnvironment() {
  return normalizeNotificationRequest({
    automatic: booleanEnvironment('BUGDROP_NOTIFICATION_AUTOMATIC', false),
    dryRun: booleanEnvironment('BUGDROP_NOTIFICATION_DRY_RUN', true),
    imageUrl: process.env.BUGDROP_NOTIFICATION_IMAGE_URL,
    mentionUserId: process.env.BUGDROP_NOTIFICATION_MENTION_USER_ID,
    message: process.env.BUGDROP_NOTIFICATION_MESSAGE,
    releasePlanIdentity: process.env.BUGDROP_RELEASE_PLAN_IDENTITY,
    repository: process.env.GITHUB_REPOSITORY,
    tag: process.env.BUGDROP_RELEASE_TAG,
  });
}

async function main() {
  const mode = process.argv[2];
  const request = requestFromEnvironment();
  if (mode === 'key') {
    process.stdout.write(`notification_key=${request.notificationKey}\n`);
    return;
  }
  if (mode !== 'notify') fail('INVALID_INPUT', 'usage: discord-release.mjs key|notify');
  const release = await fetchReleaseByTag({
    repository: request.repository,
    tag: request.tag,
    token: process.env.GITHUB_TOKEN,
  });
  const completedKeys =
    process.env.BUGDROP_NOTIFICATION_ALREADY_SENT === 'true' ? [request.notificationKey] : [];
  const result = await executeDiscordNotification({
    completedKeys,
    release,
    request,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
