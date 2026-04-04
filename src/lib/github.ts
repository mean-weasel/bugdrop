import { generateGitHubAppJWT } from './jwt';
import type { Env, GitHubIssue } from '../types';

const GITHUB_API = 'https://api.github.com';

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'User-Agent': 'BugDrop/1.0',
  'X-GitHub-Api-Version': '2022-11-28',
});

/**
 * Get installation ID for a repository
 */
async function getInstallationId(env: Env, owner: string, repo: string): Promise<number | null> {
  const jwt = await generateGitHubAppJWT(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY);

  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/installation`, {
    headers: headers(jwt),
  });

  if (!response.ok) {
    console.error(`Installation not found: ${response.status}`);
    return null;
  }

  const data = (await response.json()) as { id: number };
  return data.id;
}

/**
 * Get installation access token (scoped to installed repos)
 */
export async function getInstallationToken(
  env: Env,
  owner: string,
  repo: string
): Promise<string | null> {
  const installationId = await getInstallationId(env, owner, repo);
  if (!installationId) return null;

  const jwt = await generateGitHubAppJWT(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY);

  const response = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: headers(jwt),
  });

  if (!response.ok) {
    console.error(`Failed to get token: ${response.status}`);
    return null;
  }

  const data = (await response.json()) as { token: string };
  return data.token;
}

/**
 * Create a GitHub issue
 */
export async function createIssue(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels: string[] = ['feedback']
): Promise<GitHubIssue> {
  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ title, body, labels }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create issue: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Check if a repository is public
 */
export async function isRepoPublic(token: string, owner: string, repo: string): Promise<boolean> {
  try {
    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
      headers: headers(token),
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { private: boolean };
    return !data.private;
  } catch {
    return false;
  }
}

const SCREENSHOT_BRANCH = 'bugdrop-screenshots';

/**
 * Ensure the screenshot branch exists, creating it from the default branch if needed.
 */
async function ensureScreenshotBranch(token: string, owner: string, repo: string): Promise<void> {
  // Check if branch already exists
  const check = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${SCREENSHOT_BRANCH}`,
    { headers: headers(token) }
  );
  if (check.ok) return;

  // Get default branch SHA
  const repoRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: headers(token),
  });
  if (!repoRes.ok) {
    throw new Error(`Failed to get repo info: ${repoRes.status}`);
  }
  const repoData = (await repoRes.json()) as { default_branch: string };

  const refRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${repoData.default_branch}`,
    { headers: headers(token) }
  );
  if (!refRes.ok) {
    throw new Error(`Failed to get default branch ref: ${refRes.status}`);
  }
  const refData = (await refRes.json()) as { object: { sha: string } };

  // Create the screenshot branch
  const createRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      ref: `refs/heads/${SCREENSHOT_BRANCH}`,
      sha: refData.object.sha,
    }),
  });
  if (!createRes.ok) {
    const error = await createRes.text();
    throw new Error(`Failed to create screenshot branch: ${createRes.status} - ${error}`);
  }
}

/**
 * Upload screenshot to a dedicated branch and return a permanent URL for embedding in issues.
 * Uses a separate branch (bugdrop-screenshots) to avoid conflicts with branch protection
 * rules on the default branch. The branch is auto-created on first use.
 * Uses the blob html_url (with ?raw=true) instead of download_url, because
 * download_url includes a temporary token that expires on private repos.
 * Requires Contents:write permission on the GitHub App.
 */
export async function uploadScreenshotAsAsset(
  token: string,
  owner: string,
  repo: string,
  base64DataUrl: string
): Promise<string> {
  // Ensure the screenshot branch exists
  await ensureScreenshotBranch(token, owner, repo);

  // Remove data URL prefix and extract the base64 content
  const content = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');

  // Generate unique filename with timestamp
  const timestamp = Date.now();
  const filename = `.bugdrop/screenshots/${timestamp}.png`;

  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${filename}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({
      message: `Add BugDrop screenshot ${timestamp}`,
      content: content,
      branch: SCREENSHOT_BRANCH,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload screenshot: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as { content: { html_url: string } };
  return data.content.html_url + '?raw=true';
}
