import { expect, test } from '@playwright/test';

function widget(page: import('@playwright/test').Page) {
  return page.locator('#bugdrop-host');
}

test('local QA submissions can be created, viewed, edited, and deleted', async ({ page }) => {
  await page.goto('/test/?localQa=1&showName=true&showIssueLink=always');
  await expect(page.getByRole('link', { name: 'Local submissions' })).toBeVisible();

  await widget(page).locator('.bd-trigger').click();
  const getStarted = widget(page).getByRole('button', { name: 'Get Started' });
  if (await getStarted.isVisible()) await getStarted.click();

  await widget(page).getByLabel('Title *', { exact: true }).fill('Local CRUD submission');
  await widget(page).getByLabel('Description', { exact: true }).fill('Created from the widget.');
  await widget(page).getByLabel('Name', { exact: true }).fill('Local tester');
  await widget(page).getByLabel('📸 Include a screenshot').uncheck();
  await widget(page).getByRole('button', { name: 'Continue' }).click();

  await expect(widget(page).getByRole('heading', { name: 'Feedback Submitted!' })).toBeVisible();
  const localIssueLink = widget(page).getByRole('link', { name: 'View local submission' });
  await expect(localIssueLink).toHaveText('View local submission');
  await expect(localIssueLink).toHaveAttribute('href', /\/test\/submissions\.html\?id=\d+$/);

  const [viewer] = await Promise.all([page.waitForEvent('popup'), localIssueLink.click()]);
  await viewer.waitForLoadState('domcontentloaded');

  await expect(viewer.getByRole('heading', { name: /Submission #\d+/ })).toBeVisible();
  await expect(viewer.getByLabel('Title')).toHaveValue('Local CRUD submission');
  await expect(viewer.getByText('Local CRUD submission', { exact: true })).toBeVisible();

  await viewer.getByLabel('Title').fill('Edited local submission');
  await viewer.getByRole('button', { name: 'Save changes' }).click();
  await expect(viewer.getByRole('status')).toHaveText('Saved.');
  await expect(viewer.getByText('Edited local submission', { exact: true })).toBeVisible();

  await viewer.getByRole('button', { name: 'Delete submission' }).click();
  await expect(viewer.getByText('No local submissions yet.')).toBeVisible();
  await expect(
    viewer.getByText('Select a submission or create one from the widget.')
  ).toBeVisible();
});
