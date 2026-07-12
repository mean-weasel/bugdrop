// Tenant loader — frozen by contract docs/plans/multi-tenant-embed.md (card M1-01,
// decisions D1/D9/D10/D11). Serves the tiny bootstrap JS at /t/:key.js: a
// double-injection guard, the tenant's config baked in as data-attributes (via
// JSON.stringify — no string concatenation of raw values into JS), and a classic
// <script> pointing at the major-pinned widget core (/widget.v1.js). Unknown or
// paused tenants get a 200 warn-only body (D10) so the host page never sees a
// script error.

import { Hono } from 'hono';
import type { Env } from '../types';
import { getTenant } from '../lib/tenantStore';
import { tenantToDataAttributes } from '../lib/tenants';

const loader = new Hono<{ Bindings: Env }>();

const LOADER_HEADERS = {
  'Content-Type': 'application/javascript; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
};

loader.get('/:file{[a-z0-9-]+\\.js}', async c => {
  const key = c.req.param('file').replace(/\.js$/, '');
  const tenant = await getTenant(c.env, key);

  if (!tenant) {
    return c.body(warnOnlyScript(`unknown tenant key: ${key}`), 200, LOADER_HEADERS);
  }

  if (tenant.status === 'paused') {
    return c.body(warnOnlyScript(`tenant is paused: ${key}`), 200, LOADER_HEADERS);
  }

  const attrs = tenantToDataAttributes(tenant);
  // Absolute URL: the loader executes on the customer's origin, so a relative
  // src would resolve against their site instead of this Worker.
  const widgetUrl = `${new URL(c.req.url).origin}/widget.v1.js`;
  return c.body(loaderScript(key, attrs, widgetUrl), 200, LOADER_HEADERS);
});

/**
 * Renders the warn-only loader body for an unknown or paused tenant (D10/D4):
 * a single `console.warn`, no widget injected, still 200 so the host page
 * never sees a script error.
 */
function warnOnlyScript(message: string): string {
  return `(function () { console.warn(${JSON.stringify(`[BugDrop] ${message}`)}); })();`;
}

/**
 * Renders the loader IIFE (D1): a double-injection guard keyed on the tenant
 * key, then a classic <script src="/widget.v1.js"> carrying the tenant's
 * config as data-* attributes plus data-tenant. Every dynamic value is
 * embedded via JSON.stringify so it is XSS-safe by construction.
 */
function loaderScript(key: string, attrs: Record<string, string>, widgetUrl: string): string {
  const guardKey = `__bugdropLoaded_${key}`;
  return [
    '(function () {',
    `  var GUARD = ${JSON.stringify(guardKey)};`,
    '  if (window[GUARD]) return;',
    '  window[GUARD] = true;',
    `  var TENANT_KEY = ${JSON.stringify(key)};`,
    `  var ATTRS = ${JSON.stringify(attrs)};`,
    '  var s = document.createElement("script");',
    `  s.src = ${JSON.stringify(widgetUrl)};`,
    '  s.async = true;',
    '  s.setAttribute("data-tenant", TENANT_KEY);',
    '  for (var k in ATTRS) {',
    '    if (Object.prototype.hasOwnProperty.call(ATTRS, k)) {',
    '      s.setAttribute("data-" + k, ATTRS[k]);',
    '    }',
    '  }',
    '  document.head.appendChild(s);',
    '})();',
  ].join('\n');
}

export default loader;
