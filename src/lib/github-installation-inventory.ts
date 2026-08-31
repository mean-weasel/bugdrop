import { generateGitHubAppJWT } from './jwt';
import { GITHUB_API, githubHeaders } from './github';
import {
  isCanonicalGitHubProfileUrl,
  isGitHubAccountLogin,
  isInstallationAccountType,
  type NewInstallationRecord,
} from './installation-analytics';
import type { Env } from '../types';

const GITHUB_PAGE_SIZE = 100;
export const MAX_GITHUB_INSTALLATION_PAGES = 20;

interface GitHubListOptions {
  fetchImpl?: typeof fetch;
  createJwt?: (appId: string, privateKey: string) => Promise<string>;
}

export interface GitHubInstallationInventory {
  installationIds: number[];
  records: NewInstallationRecord[];
  skippedCount: number;
  pageCount: number;
}

export async function listActiveGitHubInstallations(
  env: Env,
  options: GitHubListOptions = {}
): Promise<GitHubInstallationInventory> {
  if (!env.GITHUB_APP_ID || !env.GITHUB_PRIVATE_KEY) {
    throw new Error('GitHub App credentials are required for installation reconciliation');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const createJwt = options.createJwt ?? generateGitHubAppJWT;
  const jwt = await createJwt(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY);
  const installationIds = new Set<number>();
  const records: NewInstallationRecord[] = [];
  let skippedCount = 0;

  for (let page = 1; page <= MAX_GITHUB_INSTALLATION_PAGES; page += 1) {
    const response = await fetchImpl(
      `${GITHUB_API}/app/installations?per_page=${GITHUB_PAGE_SIZE}&page=${page}`,
      { headers: githubHeaders(jwt) }
    );
    if (!response.ok) {
      throw new Error(`Failed to list GitHub App installations: ${response.status}`);
    }

    const installations = (await response.json()) as unknown;
    if (!Array.isArray(installations)) {
      throw new Error('GitHub returned an invalid installation list');
    }
    for (const value of installations) {
      const installation = installationFromGitHub(value);
      if (installationIds.has(installation.installationId)) {
        throw new Error('GitHub returned a duplicate installation');
      }
      installationIds.add(installation.installationId);
      if (installation.record) records.push(installation.record);
      else skippedCount += 1;
    }
    if (installations.length < GITHUB_PAGE_SIZE) {
      return { installationIds: [...installationIds], records, skippedCount, pageCount: page };
    }
  }

  throw new Error('GitHub installation pagination exceeded the safety limit');
}

function installationFromGitHub(value: unknown): {
  installationId: number;
  record: NewInstallationRecord | null;
} {
  if (!value || typeof value !== 'object') {
    throw new Error('GitHub returned an invalid installation record');
  }
  const candidate = value as {
    id?: unknown;
    account?: { login?: unknown; type?: unknown; html_url?: unknown };
    created_at?: unknown;
  };
  if (
    typeof candidate.id !== 'number' ||
    !Number.isSafeInteger(candidate.id) ||
    candidate.id <= 0
  ) {
    throw new Error('GitHub returned an invalid installation record');
  }
  const account = candidate.account;
  if (!account || !isInstallationAccountType(account.type)) {
    return { installationId: candidate.id, record: null };
  }
  const installedAt = normalizeGitHubDate(candidate.created_at);
  if (
    typeof account.login !== 'string' ||
    !isGitHubAccountLogin(account.login) ||
    typeof account.html_url !== 'string' ||
    !isCanonicalGitHubProfileUrl(account.html_url, account.login) ||
    !installedAt
  ) {
    throw new Error('GitHub returned an invalid installation record');
  }
  return {
    installationId: candidate.id,
    record: {
      installationId: candidate.id,
      account: {
        login: account.login,
        type: account.type,
        profileUrl: account.html_url,
      },
      installedAt,
    },
  };
}

function normalizeGitHubDate(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
