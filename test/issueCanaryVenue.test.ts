import type { Route } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';

import { isVenueRequest, routeVenueRequest } from '../e2e/widget.issue-canary';

describe('Issue canary venue routing', () => {
  it('matches a protected Vercel custom domain and its resources', () => {
    const venue = 'https://heartbeat.example.com';
    expect(isVenueRequest(`${venue}/`, venue)).toBe(true);
    expect(isVenueRequest(`${venue}/assets/app.js`, venue)).toBe(true);
  });

  it('does not send the venue bypass secret to the Worker or third parties', () => {
    const venue = 'https://heartbeat.example.com';
    expect(isVenueRequest('https://bugdrop.example.com/widget.js', venue)).toBe(false);
    expect(isVenueRequest('https://example.net/analytics.js', venue)).toBe(false);
  });

  it('falls through non-venue requests to the pinned widget context route', async () => {
    const fallback = vi.fn(async () => {});
    const continueRequest = vi.fn(async () => {});
    const route = {
      request: () => ({ url: () => 'https://bugdrop.example.com/widget.js' }),
      fallback,
      continue: continueRequest,
    } as unknown as Route;

    await routeVenueRequest(route, 'https://heartbeat.example.com', 'bypass-secret');

    expect(fallback).toHaveBeenCalledOnce();
    expect(continueRequest).not.toHaveBeenCalled();
  });

  it('fulfills one venue response without carrying the bypass header across redirects', async () => {
    const fallback = vi.fn(async () => {});
    const continueRequest = vi.fn(async () => {});
    const response = {};
    const fetchRequest = vi.fn(async () => response);
    const fulfill = vi.fn(async () => {});
    const route = {
      request: () => ({
        url: () => 'https://heartbeat.example.com/',
        headers: () => ({ accept: 'text/html' }),
      }),
      fallback,
      continue: continueRequest,
      fetch: fetchRequest,
      fulfill,
    } as unknown as Route;

    await routeVenueRequest(route, 'https://heartbeat.example.com', 'bypass-secret');

    expect(fetchRequest).toHaveBeenCalledWith({
      headers: {
        accept: 'text/html',
        'x-vercel-protection-bypass': 'bypass-secret',
      },
      maxRedirects: 0,
    });
    expect(fulfill).toHaveBeenCalledWith({ response });
    expect(continueRequest).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });
});
