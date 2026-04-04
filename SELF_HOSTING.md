# Self-Hosting Guide

Run your own instance of BugDrop with your own GitHub App.

## Prerequisites

- Node.js 20+
- Cloudflare account (free tier works)
- GitHub account

## 1. Create a GitHub App

1. Go to [github.com/settings/apps/new](https://github.com/settings/apps/new)
2. Configure:
   - **Name**: Choose a unique name (becomes your app's URL slug)
   - **Homepage URL**: Your worker URL (e.g., `https://bugdrop.you.workers.dev`)
   - **Webhook**: Uncheck "Active" (not needed)
3. Set permissions:
   - **Repository > Issues**: Read & Write
   - **Repository > Contents**: Read & Write
4. Click "Create GitHub App"
5. Note the **App ID** (shown at top)
6. Scroll down and click **"Generate a private key"** (downloads a .pem file)

## 2. Setup Development Environment

```bash
# Clone and install
git clone https://github.com/YOUR_USERNAME/bugdrop
cd bugdrop
make install

# Configure environment
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your GitHub App credentials:

```bash
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...your key content...
-----END RSA PRIVATE KEY-----"
```

## 3. Run Locally

```bash
make dev
# Opens http://localhost:8787
```

Visit http://localhost:8787/test/ to try the widget.

## 4. Set Up Rate Limiting (Optional)

Rate limiting prevents spam and protects GitHub API quotas. It uses Cloudflare KV for distributed storage.

```bash
# Create KV namespaces
npx wrangler kv:namespace create RATE_LIMIT
npx wrangler kv:namespace create RATE_LIMIT --preview
```

Copy the IDs from the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "<your-production-id>"
preview_id = "<your-preview-id>"
```

**Default limits:**

- 10 requests per 15 minutes per IP
- 50 requests per hour per repository

To customize limits, edit `src/middleware/rateLimit.ts` and the middleware config in `src/routes/api.ts`.

> **Note:** If you skip this step, rate limiting is disabled but the app still works.

## 5. Deploy to Cloudflare

### Manual Deploy

```bash
# Set production secrets
wrangler secret put GITHUB_APP_ID
wrangler secret put GITHUB_PRIVATE_KEY

# Deploy
make deploy
```

### Auto-Deploy via GitHub Releases

The CI workflow automatically deploys to Cloudflare when you publish a GitHub Release. This gives you explicit control over when updates go to production.

**Setup (one-time):**

1. Get your Cloudflare credentials:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Profile → API Tokens
   - Create a token with **Workers Scripts: Edit** permission
   - Note your **Account ID** from the Workers overview page

2. Add secrets to your GitHub repository:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Add these repository secrets:
     - `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token
     - `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

**To deploy a new version:**

1. Merge your PRs to `main` (tests run, but no deploy)
2. Go to your repo → Releases → **Create a new release**
3. Create a new tag (e.g., `v1.2.0`) following semver
4. Add release notes describing changes
5. Click **Publish release**
6. CI will automatically build and deploy to Cloudflare

The release tag (e.g., `v1.2.0`) becomes the version number for the widget files.

## Configuration

### Environment Variables

| Variable                 | Required | Description                                            |
| ------------------------ | -------- | ------------------------------------------------------ |
| `GITHUB_APP_ID`          | Yes      | Your GitHub App's numeric ID                           |
| `GITHUB_PRIVATE_KEY`     | Yes      | Private key from GitHub App settings                   |
| `ALLOWED_ORIGINS`        | No       | Comma-separated allowed domains (default: `*`)         |
| `GITHUB_APP_NAME`        | No       | Your app's URL slug for install links                  |
| `MAX_SCREENSHOT_SIZE_MB` | No       | Max screenshot size in MB (default: `5`)               |
| `RATE_LIMIT`             | No       | KV namespace binding for rate limiting (see section 4) |

### wrangler.toml

```toml
[vars]
ENVIRONMENT = "production"
ALLOWED_ORIGINS = "https://mysite.com,https://app.mysite.com"
GITHUB_APP_NAME = "my-bugdrop-app"
```

## Commands

```bash
make help        # Show all commands
make dev         # Start dev server (localhost:8787)
make check       # Run lint, typecheck, knip
make test        # Run unit tests
make test-e2e    # Run E2E tests
make ci          # Run full CI pipeline
make build-all   # Build widget + worker
make deploy      # Deploy to Cloudflare
```

## Project Structure

```
src/
├── index.ts           # Worker entry
├── routes/api.ts      # API endpoints
├── lib/github.ts      # GitHub API
└── widget/            # Client widget
    ├── index.ts       # Entry point
    ├── ui.ts          # UI + theming
    ├── screenshot.ts  # Capture
    ├── picker.ts      # Element selection
    └── annotator.ts   # Drawing tools
```

## Tech Stack

- **Runtime**: Cloudflare Workers + Hono
- **Auth**: GitHub App (installation tokens)
- **Widget**: TypeScript IIFE in Shadow DOM
- **Testing**: Vitest + Playwright
