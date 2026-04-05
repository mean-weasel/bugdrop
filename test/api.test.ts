import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env, FeedbackPayload } from '../src/types';

// Mock GitHub API functions
const mockGetInstallationToken = vi.fn();
const mockCreateIssue = vi.fn();
const mockUploadScreenshotAsAsset = vi.fn();
const mockIsRepoPublic = vi.fn();

vi.mock('../src/lib/github', () => ({
  getInstallationToken: (...args: unknown[]) => mockGetInstallationToken(...args),
  createIssue: (...args: unknown[]) => mockCreateIssue(...args),
  uploadScreenshotAsAsset: (...args: unknown[]) => mockUploadScreenshotAsAsset(...args),
  isRepoPublic: (...args: unknown[]) => mockIsRepoPublic(...args),
}));

// Import API routes after mocking
const createApiRoutes = async () => {
  const { default: api } = await import('../src/routes/api');
  return api;
};

describe('API Routes', () => {
  let app: Hono;
  const mockEnv: Env = {
    GITHUB_APP_ID: 'test-app-id',
    GITHUB_PRIVATE_KEY: 'test-private-key',
    ENVIRONMENT: 'test',
    ALLOWED_ORIGINS: '*',
    GITHUB_APP_NAME: 'test-bugdrop-app',
    MAX_SCREENSHOT_SIZE_MB: '5',
    ASSETS: {} as Fetcher,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Set default mock return values
    mockIsRepoPublic.mockResolvedValue(true);
    app = await createApiRoutes();
  });

  describe('GET /health', () => {
    it('should return status ok', async () => {
      const req = new Request('http://localhost/health');
      const res = await app.fetch(req, mockEnv);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toMatchObject({
        status: 'ok',
        environment: 'test',
      });
      expect(data.timestamp).toBeDefined();
    });

    it('should include CORS headers', async () => {
      const req = new Request('http://localhost/health');
      const res = await app.fetch(req, mockEnv);

      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('should return timestamp in ISO format', async () => {
      const req = new Request('http://localhost/health');
      const res = await app.fetch(req, mockEnv);
      const data = await res.json();

      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('GET /check/:owner/:repo', () => {
    it('should return installed: true when app is installed', async () => {
      mockGetInstallationToken.mockResolvedValue('test-token');

      const req = new Request('http://localhost/check/testowner/testrepo');
      const res = await app.fetch(req, mockEnv);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({
        installed: true,
        repo: 'testowner/testrepo',
        appName: 'test-bugdrop-app',
      });
      expect(mockGetInstallationToken).toHaveBeenCalledWith(mockEnv, 'testowner', 'testrepo');
    });

    it('should return installed: false when app is not installed', async () => {
      mockGetInstallationToken.mockResolvedValue(null);

      const req = new Request('http://localhost/check/testowner/testrepo');
      const res = await app.fetch(req, mockEnv);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({
        installed: false,
        repo: 'testowner/testrepo',
        appName: 'test-bugdrop-app',
      });
    });

    it('should omit appName when GITHUB_APP_NAME is not set', async () => {
      mockGetInstallationToken.mockResolvedValue('test-token');

      const envWithoutAppName = { ...mockEnv, GITHUB_APP_NAME: '' };
      const req = new Request('http://localhost/check/testowner/testrepo');
      const res = await app.fetch(req, envWithoutAppName);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({
        installed: true,
        repo: 'testowner/testrepo',
      });
      expect(data).not.toHaveProperty('appName');
    });

    it('should include CORS headers', async () => {
      mockGetInstallationToken.mockResolvedValue('test-token');

      const req = new Request('http://localhost/check/testowner/testrepo');
      const res = await app.fetch(req, mockEnv);

      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('should handle special characters in repo names', async () => {
      mockGetInstallationToken.mockResolvedValue('test-token');

      const req = new Request('http://localhost/check/test-owner/test.repo-name');
      const res = await app.fetch(req, mockEnv);
      const data = await res.json();

      expect(data.repo).toBe('test-owner/test.repo-name');
    });
  });

  describe('POST /feedback', () => {
    const validPayload: FeedbackPayload = {
      repo: 'testowner/testrepo',
      title: 'Test feedback',
      description: 'This is a test feedback',
      metadata: {
        url: 'http://localhost:3000',
        userAgent: 'Mozilla/5.0',
        viewport: { width: 1920, height: 1080 },
        timestamp: '2025-01-15T12:00:00Z',
      },
    };

    it('should create issue with valid payload', async () => {
      mockGetInstallationToken.mockResolvedValue('test-token');
      mockCreateIssue.mockResolvedValue({
        number: 42,
        html_url: 'https://github.com/testowner/testrepo/issues/42',
      });

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      });
      const res = await app.fetch(req, mockEnv);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({
        success: true,
        issueNumber: 42,
        issueUrl: 'https://github.com/testowner/testrepo/issues/42',
        isPublic: true,
      });
      expect(mockCreateIssue).toHaveBeenCalledWith(
        'test-token',
        'testowner',
        'testrepo',
        'Test feedback',
        expect.stringContaining('This is a test feedback'),
        ['bug', 'bugdrop']
      );
    });

    it('should return 400 when repo is missing', async () => {
      const invalidPayload = { ...validPayload, repo: undefined };

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPayload),
      });
      const res = await app.fetch(req, mockEnv);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Missing required fields');
    });

    it('should return 400 when title is missing', async () => {
      const invalidPayload = { ...validPayload, title: undefined };

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPayload),
      });
      const res = await app.fetch(req, mockEnv);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Missing required fields');
    });

    it('should accept submission when description is missing (optional field)', async () => {
      const payload = { ...validPayload, description: undefined };

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const res = await app.fetch(req, mockEnv);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 400 when repo format is invalid', async () => {
      const invalidPayload = { ...validPayload, repo: 'invalidformat' };

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPayload),
      });
      const res = await app.fetch(req, mockEnv);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Invalid repo format');
    });

    it('should return 400 when JSON is invalid', async () => {
      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      });
      const res = await app.fetch(req, mockEnv);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Invalid JSON');
    });

    it('should return 403 when app is not installed with configurable app name', async () => {
      mockGetInstallationToken.mockResolvedValue(null);

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      });
      const res = await app.fetch(req, mockEnv);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('not installed');
      expect(data.installUrl).toBe('https://github.com/apps/test-bugdrop-app/installations/new');
    });

    it('should upload screenshot and include URL in issue body', async () => {
      mockGetInstallationToken.mockResolvedValue('test-token');
      const screenshotDataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const uploadedUrl =
        'https://raw.githubusercontent.com/testowner/testrepo/main/.feedback/screenshots/123456.png';
      mockUploadScreenshotAsAsset.mockResolvedValue(uploadedUrl);
      mockCreateIssue.mockResolvedValue({
        number: 42,
        html_url: 'https://github.com/testowner/testrepo/issues/42',
      });

      const payloadWithScreenshot = {
        ...validPayload,
        screenshot: screenshotDataUrl,
      };

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithScreenshot),
      });
      const res = await app.fetch(req, mockEnv);

      expect(res.status).toBe(200);
      expect(mockUploadScreenshotAsAsset).toHaveBeenCalledWith(
        'test-token',
        'testowner',
        'testrepo',
        screenshotDataUrl
      );
      expect(mockCreateIssue).toHaveBeenCalledWith(
        'test-token',
        'testowner',
        'testrepo',
        'Test feedback',
        expect.stringContaining(uploadedUrl),
        ['bug', 'bugdrop']
      );
    });

    it('should use screenshot when provided (annotations handled client-side)', async () => {
      mockGetInstallationToken.mockResolvedValue('test-token');
      const screenshotDataUrl = 'data:image/png;base64,screenshot';
      const uploadedUrl =
        'https://raw.githubusercontent.com/testowner/testrepo/main/.feedback/screenshots/789.png';
      mockUploadScreenshotAsAsset.mockResolvedValue(uploadedUrl);
      mockCreateIssue.mockResolvedValue({
        number: 42,
        html_url: 'https://github.com/testowner/testrepo/issues/42',
      });

      const payloadWithScreenshot = {
        ...validPayload,
        screenshot: screenshotDataUrl,
      };

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithScreenshot),
      });
      await app.fetch(req, mockEnv);

      expect(mockUploadScreenshotAsAsset).toHaveBeenCalledWith(
        'test-token',
        'testowner',
        'testrepo',
        screenshotDataUrl
      );
    });

    it('should include CORS headers', async () => {
      mockGetInstallationToken.mockResolvedValue('test-token');
      mockCreateIssue.mockResolvedValue({
        number: 42,
        html_url: 'https://github.com/testowner/testrepo/issues/42',
      });

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      });
      const res = await app.fetch(req, mockEnv);

      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('should reject screenshot exceeding size limit', async () => {
      // Create a large base64 string (> 5MB when decoded)
      // 5MB = 5 * 1024 * 1024 bytes, base64 encoding is ~4/3 ratio
      const largeScreenshot = 'data:image/png;base64,' + 'A'.repeat(8 * 1024 * 1024);

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validPayload,
          screenshot: largeScreenshot,
        }),
      });
      const res = await app.fetch(req, mockEnv);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Screenshot too large');
      expect(data.error).toContain('exceeds 5MB limit');
    });

    it('should return 500 when GitHub API fails', async () => {
      mockGetInstallationToken.mockResolvedValue('test-token');
      mockCreateIssue.mockRejectedValue(new Error('GitHub API error'));

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      });
      const res = await app.fetch(req, mockEnv);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toContain('GitHub API error');
    });

    it('should format issue body with metadata', async () => {
      mockGetInstallationToken.mockResolvedValue('test-token');
      mockCreateIssue.mockResolvedValue({
        number: 42,
        html_url: 'https://github.com/testowner/testrepo/issues/42',
      });

      const payloadWithSelector = {
        ...validPayload,
        metadata: {
          ...validPayload.metadata,
          elementSelector: '#submit-button',
        },
      };

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithSelector),
      });
      await app.fetch(req, mockEnv);

      const issueBody = mockCreateIssue.mock.calls[0][4];
      expect(issueBody).toContain('## Description');
      expect(issueBody).toContain('This is a test feedback');
      expect(issueBody).toContain('System Info');
      expect(issueBody).toContain('http://localhost:3000');
      expect(issueBody).toContain('1920×1080');
      expect(issueBody).toContain('#submit-button');
      expect(issueBody).toContain('Submitted via');
    });

    it('should include submitter info in issue body when provided', async () => {
      mockGetInstallationToken.mockResolvedValue('test-token');
      mockCreateIssue.mockResolvedValue({
        number: 42,
        html_url: 'https://github.com/testowner/testrepo/issues/42',
      });

      const payloadWithSubmitter = {
        ...validPayload,
        submitter: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      };

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithSubmitter),
      });
      await app.fetch(req, mockEnv);

      const issueBody = mockCreateIssue.mock.calls[0][4];
      expect(issueBody).toContain('## Submitted by');
      expect(issueBody).toContain('**John Doe**');
      expect(issueBody).toContain('(john@example.com)');
    });

    it('should handle submitter with only name', async () => {
      mockGetInstallationToken.mockResolvedValue('test-token');
      mockCreateIssue.mockResolvedValue({
        number: 42,
        html_url: 'https://github.com/testowner/testrepo/issues/42',
      });

      const payloadWithName = {
        ...validPayload,
        submitter: { name: 'Jane Doe' },
      };

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithName),
      });
      await app.fetch(req, mockEnv);

      const issueBody = mockCreateIssue.mock.calls[0][4];
      expect(issueBody).toContain('## Submitted by');
      expect(issueBody).toContain('**Jane Doe**');
      // Should not contain email format (email in parentheses after name)
      expect(issueBody).not.toMatch(/\*\*Jane Doe\*\*.*\(/);
    });

    it('should not include submitter section when not provided', async () => {
      mockGetInstallationToken.mockResolvedValue('test-token');
      mockCreateIssue.mockResolvedValue({
        number: 42,
        html_url: 'https://github.com/testowner/testrepo/issues/42',
      });

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      });
      await app.fetch(req, mockEnv);

      const issueBody = mockCreateIssue.mock.calls[0][4];
      expect(issueBody).not.toContain('## Submitted by');
    });
  });

  describe('OPTIONS preflight requests', () => {
    it('should handle CORS preflight for /health', async () => {
      const req = new Request('http://localhost/health', {
        method: 'OPTIONS',
      });
      const res = await app.fetch(req, mockEnv);

      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    });

    it('should handle CORS preflight for /feedback', async () => {
      const req = new Request('http://localhost/feedback', {
        method: 'OPTIONS',
      });
      const res = await app.fetch(req, mockEnv);

      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    });
  });
});
