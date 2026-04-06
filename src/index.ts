import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { Env } from './types';
import api from './routes/api';

const app = new Hono<{ Bindings: Env }>();

// Log warning about missing credentials (but don't block non-authenticated routes)
let envChecked = false;
app.use('*', async (c, next) => {
  if (!envChecked) {
    const missing: string[] = [];
    if (!c.env.GITHUB_APP_ID) missing.push('GITHUB_APP_ID');
    if (!c.env.GITHUB_PRIVATE_KEY) missing.push('GITHUB_PRIVATE_KEY');

    if (missing.length > 0) {
      console.warn(
        `[BugDrop] Missing env vars (feedback endpoint will fail): ${missing.join(', ')}`
      );
    }

    // Warn about development-only settings
    if (c.env.ALLOWED_ORIGINS === '*' && c.env.ENVIRONMENT !== 'development') {
      console.warn('WARNING: ALLOWED_ORIGINS is set to "*" in non-development environment');
    }

    envChecked = true;
  }
  return next();
});

// Request logging
app.use('*', logger());

// Mount API routes
app.route('/api', api);

// Redirect to landing page on Vercel
app.get('/', c => {
  return c.redirect('https://bugdrop.dev', 301);
});

// Serve widget.js from static assets
app.get('/widget.js', async c => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
