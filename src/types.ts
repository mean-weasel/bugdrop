export interface Env {
  // Secrets (from .dev.vars locally, wrangler secret in production)
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;

  // Variables (from wrangler.toml)
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string; // Comma-separated list of allowed origins, or "*" for dev
  GITHUB_APP_NAME: string; // Your GitHub App name for install URL
  MAX_SCREENSHOT_SIZE_MB: string; // Max screenshot size in MB (default: 5)

  // Bindings
  ASSETS: Fetcher;
  RATE_LIMIT?: KVNamespace; // Optional: for rate limiting (create with wrangler kv:namespace create RATE_LIMIT)
}

type FeedbackCategory = 'bug' | 'feature' | 'question';

export interface FeedbackPayload {
  repo: string; // "owner/repo" format
  title: string;
  description: string;
  category?: FeedbackCategory; // Feedback type (maps to GitHub labels)
  screenshot?: string; // base64 data URL
  annotations?: string; // base64 annotated image
  submitter?: {
    // Optional submitter info (configured per widget)
    name?: string;
    email?: string;
  };
  metadata: {
    url: string;
    userAgent: string;
    viewport: { width: number; height: number };
    timestamp: string;
    elementSelector?: string;
    // Parsed system info
    browser?: { name: string; version: string };
    os?: { name: string; version: string };
    devicePixelRatio?: number;
    language?: string;
  };
}

export interface GitHubIssue {
  number: number;
  html_url: string;
}
