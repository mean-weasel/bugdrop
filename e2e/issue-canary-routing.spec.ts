import { createServer, type Server } from 'node:http';

import { expect, test } from '@playwright/test';

import { routeVenueRequest } from './widget.issue-canary';

const BYPASS_SECRET = 'redirect-leak-regression-sentinel';

test('does not forward the venue bypass header across an origin redirect', async ({ page }) => {
  let receivedByRedirectTarget: string | undefined;
  const redirectTarget = await listen((request, response) => {
    receivedByRedirectTarget = request.headers['x-vercel-protection-bypass'] as string | undefined;
    response.end('redirected');
  });
  const venue = await listen((_request, response) => {
    response.writeHead(302, { Location: `${redirectTarget.origin}/capture` });
    response.end();
  });

  try {
    await page.route('**/*', route => routeVenueRequest(route, venue.origin, BYPASS_SECRET));
    const response = await page.goto(venue.origin);

    expect(response?.url()).toBe(`${redirectTarget.origin}/capture`);
    expect(receivedByRedirectTarget).toBeUndefined();
  } finally {
    await Promise.all([close(venue.server), close(redirectTarget.server)]);
  }
});

async function listen(
  handler: Parameters<typeof createServer>[0]
): Promise<{ origin: string; server: Server }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server has no TCP address');
  return { origin: `http://127.0.0.1:${address.port}`, server };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
}
