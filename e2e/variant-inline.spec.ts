import { expect, test } from '@playwright/test';

test.describe('rendered inline variants', () => {
  test('submits an exact star-review draft only after explicit Submit and supports reset', async ({
    page,
  }) => {
    const submissions: Array<Record<string, unknown>> = [];
    await page.route('**/api/feedback', route => {
      submissions.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          issueNumber: 104,
          issueUrl: 'https://github.com/mean-weasel/bugdrop-widget-test/issues/104',
          isPublic: true,
        }),
      });
    });
    await page.goto('/test/?private=redacted#secret');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();
    await page.evaluate(() => {
      const slot = document.createElement('div');
      slot.id = 'export-review-slot';
      document.body.appendChild(slot);
      const handle = window.BugDrop!.registerVariant({
        id: 'export-review-rendered',
        presentation: { kind: 'inline' },
        content: {
          title: 'How was this export?',
          description: 'Your feedback helps us improve exports.',
          submitLabel: 'Submit review',
          successTitle: 'Thanks for the review!',
        },
        fields: [
          {
            id: 'rating',
            type: 'rating',
            label: 'Rating',
            required: true,
            scale: 5,
            icon: 'star',
          },
          {
            id: 'message',
            type: 'longText',
            label: 'Anything else?',
            maxLength: 1000,
          },
        ],
        issue: {
          classification: 'feedback',
          title: '[Export review] {{rating}}/5',
          sections: [
            { heading: 'Rating', field: 'rating', format: 'stars' },
            { heading: 'Comment', field: 'message', omitWhenEmpty: true },
          ],
        },
      });
      const mounted = handle.mount(slot, {
        context: { surface: 'export-complete' },
        initialAnswers: { rating: 2 },
      });
      (
        window as Window & {
          __renderedReview?: { reset(): void; unmount(): void; instanceId: string };
        }
      ).__renderedReview = mounted;
    });

    const host = page.locator('#export-review-slot > [data-bugdrop-owned]');
    await expect(host).toHaveAttribute('data-bugdrop-instance', /export-review-rendered-/);
    const rating = host.getByRole('radiogroup', { name: 'Rating' });
    await expect(rating.getByRole('radio', { name: '2 stars' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    const stars = rating.getByRole('radio');
    const selectedStyle = await stars.nth(1).evaluate(element => {
      const style = getComputedStyle(element);
      return `${style.color}|${style.borderColor}|${style.backgroundColor}`;
    });
    const idleStyle = await stars.nth(4).evaluate(element => {
      const style = getComputedStyle(element);
      return `${style.color}|${style.borderColor}|${style.backgroundColor}`;
    });
    await rating.getByRole('radio', { name: '4 stars' }).hover();
    await expect(stars.nth(0)).toHaveClass(/bdv-rating-option--preview/);
    await expect(stars.nth(1)).toHaveClass(/bdv-rating-option--preview/);
    await expect(stars.nth(2)).toHaveClass(/bdv-rating-option--preview/);
    await expect(stars.nth(3)).toHaveClass(/bdv-rating-option--preview/);
    await expect(stars.nth(4)).not.toHaveClass(/bdv-rating-option--preview/);
    await expect(rating.getByRole('radio', { name: '2 stars' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    const previewStyle = await stars.nth(3).evaluate(element => {
      const style = getComputedStyle(element);
      return `${style.color}|${style.borderColor}|${style.backgroundColor}`;
    });
    expect(previewStyle).not.toBe(idleStyle);
    expect(previewStyle).not.toBe(selectedStyle);

    await rating.getByRole('radio', { name: '5 stars' }).click();
    await page.mouse.move(0, 0);
    for (let index = 0; index < 5; index += 1) {
      await expect(stars.nth(index)).not.toHaveClass(/bdv-rating-option--preview/);
      await expect(stars.nth(index)).toHaveClass(/bdv-rating-option--active/);
    }
    await expect(rating.getByRole('radio', { name: '5 stars' })).toHaveAttribute(
      'aria-checked',
      'true'
    );

    await rating.getByRole('radio', { name: '2 stars' }).hover();
    for (let index = 0; index < 2; index += 1) {
      await expect(stars.nth(index)).toHaveClass(/bdv-rating-option--preview/);
    }
    for (let index = 2; index < 5; index += 1) {
      await expect(stars.nth(index)).not.toHaveClass(/bdv-rating-option--preview/);
    }
    for (let index = 0; index < 5; index += 1) {
      await expect(stars.nth(index)).not.toHaveClass(/bdv-rating-option--active/);
    }
    await expect(rating.getByRole('radio', { name: '5 stars' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(rating.getByRole('radio', { name: '5 stars' })).toHaveAttribute('tabindex', '0');
    const secondStarBox = await stars.nth(1).boundingBox();
    const thirdStarBox = await stars.nth(2).boundingBox();
    expect(secondStarBox).not.toBeNull();
    expect(thirdStarBox).not.toBeNull();
    const gapWidth = thirdStarBox!.x - (secondStarBox!.x + secondStarBox!.width);
    expect(gapWidth).toBeCloseTo(6, 0);
    const gapX = secondStarBox!.x + secondStarBox!.width + gapWidth / 2;
    const gapY = secondStarBox!.y + secondStarBox!.height / 2;
    await page.mouse.move(gapX, gapY);
    for (let index = 0; index < 5; index += 1) {
      await expect(stars.nth(index)).not.toHaveClass(/bdv-rating-option--preview/);
      await expect(stars.nth(index)).toHaveClass(/bdv-rating-option--active/);
    }
    await expect(rating.getByRole('radio', { name: '5 stars' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(rating.getByRole('radio', { name: '5 stars' })).toHaveAttribute('tabindex', '0');

    await rating.getByRole('radio', { name: '3 stars' }).hover();
    for (let index = 0; index < 3; index += 1) {
      await expect(stars.nth(index)).toHaveClass(/bdv-rating-option--preview/);
    }
    for (let index = 3; index < 5; index += 1) {
      await expect(stars.nth(index)).not.toHaveClass(/bdv-rating-option--preview/);
    }
    const ratingBox = await rating.boundingBox();
    const lastStarBox = await stars.nth(4).boundingBox();
    expect(ratingBox).not.toBeNull();
    expect(lastStarBox).not.toBeNull();
    const trailingX = ratingBox!.x + ratingBox!.width - 1;
    expect(trailingX).toBeGreaterThan(lastStarBox!.x + lastStarBox!.width);
    await page.mouse.move(trailingX, ratingBox!.y + ratingBox!.height / 2);
    for (let index = 0; index < 5; index += 1) {
      await expect(stars.nth(index)).not.toHaveClass(/bdv-rating-option--preview/);
      await expect(stars.nth(index)).toHaveClass(/bdv-rating-option--active/);
    }
    await expect(rating.getByRole('radio', { name: '5 stars' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(rating.getByRole('radio', { name: '5 stars' })).toHaveAttribute('tabindex', '0');

    await rating.getByRole('radio', { name: '4 stars' }).click();
    await page.mouse.move(0, 0);
    await expect(rating.getByRole('radio', { name: '4 stars' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    const clickedStyle = await stars.nth(3).evaluate(element => {
      const style = getComputedStyle(element);
      return `${style.color}|${style.borderColor}|${style.backgroundColor}`;
    });
    expect(clickedStyle).not.toBe(previewStyle);
    expect(submissions).toHaveLength(0);
    await host.getByRole('textbox', { name: 'Anything else?' }).fill('  Fast and clear.  ');
    expect(submissions).toHaveLength(0);
    await host.getByRole('button', { name: 'Submit review' }).click();
    await expect(host.getByRole('heading', { name: 'Thanks for the review!' })).toBeVisible();

    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      kind: 'bugdrop.variant-submission',
      schemaVersion: 1,
      repo: 'mean-weasel/bugdrop-widget-test',
      variantId: 'export-review-rendered',
      issue: {
        title: '[Export review] 4/5',
        classification: 'feedback',
        sections: [
          { heading: 'Rating', value: '★★★★☆ (4/5)', format: 'text' },
          { heading: 'Comment', value: 'Fast and clear.', format: 'text' },
        ],
      },
      metadata: { url: new URL('/test/', page.url()).href },
    });
    expect(submissions[0]?.submissionId).toEqual(expect.any(String));
    expect(submissions[0]).not.toHaveProperty('labels');
    expect(submissions[0]).not.toHaveProperty('fields');

    await page.evaluate(() => {
      (
        window as Window & {
          __renderedReview?: { reset(): void };
        }
      ).__renderedReview?.reset();
    });
    await expect(host.getByRole('heading', { name: 'How was this export?' })).toBeVisible();
    await expect(rating.getByRole('radio', { name: '2 stars' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(host.getByRole('textbox', { name: 'Anything else?' })).toHaveValue('');
    await host.getByRole('button', { name: 'Submit review' }).click();
    await expect(host.getByRole('heading', { name: 'Thanks for the review!' })).toBeVisible();
    expect(submissions).toHaveLength(2);
    expect(submissions[1]).toMatchObject({
      issue: {
        title: '[Export review] 2/5',
        sections: [{ heading: 'Rating', value: '★★☆☆☆ (2/5)', format: 'text' }],
      },
    });
    expect(submissions[1]?.submissionId).not.toBe(submissions[0]?.submissionId);
  });

  test('focuses invalid rating, supports keyboard selection, and never submits on selection', async ({
    page,
  }) => {
    let submissionCount = 0;
    await page.route('**/api/feedback', route => {
      submissionCount += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          issueNumber: 105,
          issueUrl: 'https://github.com/mean-weasel/bugdrop-widget-test/issues/105',
          isPublic: false,
        }),
      });
    });
    await page.goto('/test/');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();
    await page.evaluate(() => {
      const slot = document.createElement('div');
      slot.id = 'keyboard-review-slot';
      document.body.appendChild(slot);
      window
        .BugDrop!.registerVariant({
          id: 'keyboard-review',
          presentation: { kind: 'inline' },
          content: { title: 'Rate keyboard support', submitLabel: 'Send rating' },
          fields: [
            { id: 'rating', type: 'rating', label: 'Rating', required: true, scale: 5 },
            { id: 'tag', type: 'shortText', label: 'Optional tag' },
          ],
          issue: { title: 'Keyboard rating {{rating}}' },
        })
        .mount(slot);
    });

    const host = page.locator('#keyboard-review-slot > [data-bugdrop-owned]');
    const submit = host.getByRole('button', { name: 'Send rating' });
    const rating = host.getByRole('radiogroup', { name: 'Rating' });
    const first = rating.getByRole('radio', { name: '1 star' });
    await submit.click();
    expect(submissionCount).toBe(0);
    await expect(rating).toHaveAttribute('aria-invalid', 'true');
    await expect(first).toBeFocused();

    await first.press('ArrowRight');
    await expect(rating.getByRole('radio', { name: '2 stars' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(submissionCount).toBe(0);
    await host.getByRole('textbox', { name: 'Optional tag' }).fill('keyboard');
    await host.getByRole('textbox', { name: 'Optional tag' }).press('Enter');
    expect(submissionCount).toBe(0);
    await submit.click();
    await expect(host.getByRole('heading', { name: 'Thanks for your feedback!' })).toBeVisible();
    expect(submissionCount).toBe(1);
    await expect(host.getByRole('link', { name: 'View GitHub Issue' })).toBeHidden();
  });

  test('keeps two mounted reviews isolated and disposes only the requested instance', async ({
    page,
  }) => {
    await page.goto('/test/');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();
    const instances = await page.evaluate(() => {
      const firstSlot = document.createElement('div');
      firstSlot.id = 'first-review-slot';
      const secondSlot = document.createElement('div');
      secondSlot.id = 'second-review-slot';
      document.body.append(firstSlot, secondSlot);
      const handle = window.BugDrop!.registerVariant({
        id: 'multi-review',
        presentation: { kind: 'inline' },
        content: { title: 'Multi review' },
        fields: [{ id: 'rating', type: 'rating', label: 'Rating', required: true }],
        issue: { title: 'Multi {{rating}}' },
      });
      const first = handle.mount(firstSlot, { initialAnswers: { rating: 1 } });
      const second = handle.mount(secondSlot, { initialAnswers: { rating: 5 } });
      first.unmount();
      return { first: first.instanceId, second: second.instanceId };
    });

    expect(instances.first).not.toBe(instances.second);
    await expect(page.locator('#first-review-slot > [data-bugdrop-owned]')).toHaveCount(0);
    const second = page.locator('#second-review-slot > [data-bugdrop-owned]');
    await expect(second).toHaveAttribute('data-bugdrop-instance', instances.second);
    await expect(second.getByRole('radio', { name: '5 stars' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await second.getByRole('radio', { name: '2 stars' }).hover();
    const secondStars = second.getByRole('radio');
    await expect(secondStars.nth(0)).toHaveClass(/bdv-rating-option--preview/);
    await expect(secondStars.nth(1)).toHaveClass(/bdv-rating-option--preview/);
    await expect(secondStars.nth(2)).not.toHaveClass(/bdv-rating-option--preview/);
    await expect(second.getByRole('radio', { name: '5 stars' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  test('submits an exact single-choice poll draft only through explicit Submit and resets identity', async ({
    page,
  }) => {
    const submissions: Array<Record<string, unknown>> = [];
    await page.route('**/api/feedback', route => {
      submissions.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          issueNumber: 106,
          issueUrl: 'https://github.com/mean-weasel/bugdrop-widget-test/issues/106',
          isPublic: false,
        }),
      });
    });
    await page.goto('/test/');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();
    await page.evaluate(() => {
      const slot = document.createElement('div');
      slot.id = 'poll-slot';
      document.body.appendChild(slot);
      const mounted = window
        .BugDrop!.registerVariant({
          id: 'next-integration-poll',
          presentation: { kind: 'inline' },
          content: { title: 'What should we build next?', submitLabel: 'Vote' },
          fields: [
            {
              id: 'choice',
              type: 'singleChoice',
              label: 'Choose one',
              required: true,
              display: 'cards',
              options: [
                {
                  value: 'onedrive-stable',
                  label: '<OneDrive>',
                  description: 'Microsoft storage',
                },
                { value: 'box-stable', label: 'Box', description: 'Secure content cloud' },
              ],
            },
            { id: 'detail', type: 'longText', label: 'Optional detail', maxLength: 500 },
          ],
          issue: {
            classification: 'feature',
            title: 'Integration vote — {{choice}}',
            sections: [
              { heading: 'Choice', field: 'choice', format: 'choice' },
              { heading: 'Detail', field: 'detail', omitWhenEmpty: true },
            ],
          },
        })
        .mount(slot);
      (window as Window & { __poll?: { reset(): void; unmount(): void } }).__poll = mounted;
    });

    const host = page.locator('#poll-slot > [data-bugdrop-owned]');
    const group = host.getByRole('radiogroup', { name: 'Choose one' });
    const submit = host.getByRole('button', { name: 'Vote' });
    await submit.click();
    await expect(group).toHaveAttribute('aria-invalid', 'true');
    const oneDrive = group.getByRole('radio', { name: '<OneDrive> Microsoft storage' });
    await expect(oneDrive).toBeFocused();
    expect(submissions).toHaveLength(0);
    await oneDrive.click();
    expect(submissions).toHaveLength(0);
    await expect(host.locator('img')).toHaveCount(0);
    expect(
      await oneDrive.evaluate(element => element.closest('label')!.getBoundingClientRect().height)
    ).toBeGreaterThanOrEqual(44);
    await host.getByRole('textbox', { name: 'Optional detail' }).fill('  Please add sync.  ');
    expect(submissions).toHaveLength(0);
    await submit.click();
    await expect(host.getByRole('heading', { name: 'Thanks for your feedback!' })).toBeVisible();

    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      kind: 'bugdrop.variant-submission',
      schemaVersion: 1,
      variantId: 'next-integration-poll',
      issue: {
        title: 'Integration vote — onedrive-stable',
        classification: 'feature',
        sections: [
          { heading: 'Choice', value: '<OneDrive>', format: 'text' },
          { heading: 'Detail', value: 'Please add sync.', format: 'text' },
        ],
      },
    });

    await page.evaluate(() => (window as Window & { __poll?: { reset(): void } }).__poll?.reset());
    await expect(oneDrive).not.toBeChecked();
    await expect(host.getByRole('textbox', { name: 'Optional detail' })).toHaveValue('');
    const box = group.getByRole('radio', { name: 'Box Secure content cloud' });
    await box.click();
    expect(submissions).toHaveLength(1);
    await submit.click();
    expect(submissions).toHaveLength(2);
    expect(submissions[1]).toMatchObject({
      issue: {
        title: 'Integration vote — box-stable',
        sections: [{ heading: 'Choice', value: 'Box', format: 'text' }],
      },
    });
    expect(submissions[1]?.submissionId).not.toBe(submissions[0]?.submissionId);

    await page.evaluate(() =>
      (window as Window & { __poll?: { unmount(): void } }).__poll?.unmount()
    );
    await expect(host).toHaveCount(0);
  });
});
