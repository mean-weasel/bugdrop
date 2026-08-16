// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeFlowDefinition } from '../src/widget/flows/definition';
import { createFlowFormScreen } from '../src/widget/flows/form-screen';
import { compileFlowIssueDraft } from '../src/widget/flows/issue-draft';
import { FlowRuntime } from '../src/widget/flows/runtime';
import { validateAndFreezeFlowConfig } from '../src/widget/flows/validate-config';
import { flowRecipeList, flowRecipes } from './fixtures/flow-recipes';

describe('representative FlowConfig recipe conformance', () => {
  beforeEach(() => document.body.replaceChildren());

  it('validates and freezes exactly three bounded natural recipes', () => {
    expect(flowRecipeList.map(recipe => recipe.id)).toEqual([
      'bug-report',
      'product-triage',
      'customer-pulse',
    ]);
    for (const recipe of flowRecipeList) {
      const config = validateAndFreezeFlowConfig(recipe.config);
      expect(config.id).toBe(recipe.id);
      expect(Object.isFrozen(config)).toBe(true);
      expect(config.forms.length).toBeLessThanOrEqual(2);
      expect(config.screens.length).toBeLessThanOrEqual(4);
    }
  });

  it('reuses shared field controllers through the thin flow adapter', async () => {
    const triage = flowRecipes['product-triage'].config.forms[0]!;
    const diagnostics = flowRecipes['product-triage'].config.forms[1]!;
    const triageController = createFlowFormScreen(triage, 'triage-adapter', {});
    const diagnosticsController = createFlowFormScreen(diagnostics, 'diagnostics-adapter', {});
    document.body.append(triageController.element, diagnosticsController.element);

    const kind = triageController.element.querySelector<HTMLInputElement>('input[value="bug"]')!;
    const rating = triageController.element.querySelector<HTMLButtonElement>(
      '[role="radio"][aria-label="2 stars"]'
    )!;
    const summary = triageController.element.querySelector<HTMLInputElement>('input[type="text"]')!;
    const detail = diagnosticsController.element.querySelector<HTMLTextAreaElement>('textarea')!;
    const browser =
      diagnosticsController.element.querySelector<HTMLInputElement>('input[value="chromium"]')!;
    expect(kind.closest('[role="radiogroup"]')?.classList).toContain('cards');
    expect(rating.closest('[role="radiogroup"]')).not.toBeNull();
    expect(browser.closest('[role="radiogroup"]')?.classList).toContain('radio');

    kind.click();
    rating.click();
    summary.value = '  Checkout crashes  ';
    detail.value = '  Spinner never stops  ';
    browser.click();
    expect(await triageController.collect()).toEqual({
      kind: 'bug',
      rating: 2,
      summary: 'Checkout crashes',
    });
    expect(await diagnosticsController.collect()).toEqual({
      detail: 'Spinner never stops',
      browser: 'chromium',
    });
    triageController.dispose();
    diagnosticsController.dispose();
  });

  it('namespaces simultaneous thin flow adapters and disposes them independently', async () => {
    const triage = flowRecipes['product-triage'].config.forms[0]!;
    const first = createFlowFormScreen(triage, 'first-instance', {});
    const second = createFlowFormScreen(triage, 'second-instance', {});
    document.body.append(first.element, second.element);

    const firstIds = [...first.element.querySelectorAll<HTMLElement>('[id]')].map(node => node.id);
    const secondIds = [...second.element.querySelectorAll<HTMLElement>('[id]')].map(
      node => node.id
    );
    expect(firstIds.every(id => id.startsWith('first-instance-'))).toBe(true);
    expect(secondIds.every(id => id.startsWith('second-instance-'))).toBe(true);
    expect(firstIds.filter(id => secondIds.includes(id))).toEqual([]);
    expect(first.element.querySelector<HTMLInputElement>('input[value="bug"]')?.name).toBe(
      'first-instance-kind'
    );
    expect(second.element.querySelector<HTMLInputElement>('input[value="bug"]')?.name).toBe(
      'second-instance-kind'
    );

    first.dispose();
    first.dispose();
    second.element.querySelector<HTMLInputElement>('input[value="idea"]')!.click();
    second.element.querySelector<HTMLButtonElement>('[aria-label="5 stars"]')!.click();
    const summary = second.element.querySelector<HTMLInputElement>('input[type="text"]')!;
    summary.value = 'Independent adapter';
    await expect(second.collect()).resolves.toEqual({
      kind: 'idea',
      rating: 5,
      summary: 'Independent adapter',
    });
    second.dispose();
  });

  it('compiles the three recipes with their declared formatters and evidence mappings', () => {
    const bug = compileFlowIssueDraft(
      flowRecipes['bug-report'].config,
      {
        'report.summary': 'Save crashes',
        'report.steps': 'Open settings\nClick save',
      },
      { surface: 'settings', build: '2026.08.15' }
    );
    expect(bug).toEqual({
      title: 'Bug: Save crashes',
      category: 'bug',
      description:
        '## Steps\n\n> Open settings\n> Click save\n\n## Surface\n\nsettings\n\n## Build\n\n`2026.08.15`',
    });

    const triage = compileFlowIssueDraft(
      flowRecipes['product-triage'].config,
      {
        'triage.kind': 'bug',
        'triage.rating': 2,
        'triage.summary': 'Checkout',
      },
      {}
    );
    expect(triage.description).toBe('## Type\n\nBug\n\n## Experience\n\n★★☆☆☆ (2/5)');

    const pulse = compileFlowIssueDraft(
      flowRecipes['customer-pulse'].config,
      {
        'pulse.score': 3,
        'followup.contact': 'yes',
        'followup.consent': true,
      },
      { surface: 'billing' }
    );
    expect(pulse).toMatchObject({
      title: 'Billing pulse 3/10',
      category: 'question',
      description: '## Score\n\n3\n\n## Contact\n\nYes\n\n## Consent\n\ntrue',
    });
  });

  it('owns natural branch visibility without generating permutations', () => {
    const triageDefinition = normalizeFlowDefinition(
      validateAndFreezeFlowConfig(flowRecipes['product-triage'].config)
    );
    const blockedBug = new FlowRuntime(triageDefinition, {});
    blockedBug.next();
    blockedBug.setFormAnswers('triage', { kind: 'bug', rating: 2, summary: 'Crash' });
    expect(blockedBug.route().total).toBe(4);
    blockedBug.next();
    blockedBug.setFormAnswers('diagnostics', { detail: 'stale', browser: 'chromium' });
    blockedBug.back();
    blockedBug.setFormAnswers('triage', { kind: 'idea', rating: 5, summary: 'Idea' });
    expect(blockedBug.route()).toMatchObject({ total: 2, position: 2, hasNext: false });
    expect(blockedBug.answers['diagnostics.detail']).toBeUndefined();

    const pulse = new FlowRuntime(
      normalizeFlowDefinition(validateAndFreezeFlowConfig(flowRecipes['customer-pulse'].config)),
      { surface: 'billing' }
    );
    pulse.setFormAnswers('pulse', { score: 3 });
    expect(pulse.route()).toMatchObject({ total: 2, hasNext: true });
  });
});
