import { test } from './live-preview-widget';
import { runIssueCanary } from './widget.issue-canary';

test.describe.configure({ mode: 'serial', retries: 0 });

test('rendered CTA preview widget creates one real Issue with exact deployment identity', async ({
  page,
}) => {
  await runIssueCanary(page);
});
