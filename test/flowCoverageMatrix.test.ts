import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalFlowCoverage } from './fixtures/flow-coverage';
import { flowRecipes } from './fixtures/flow-recipes';

const EXACT_COVERED_SURFACE = [
  'field.shortText',
  'field.helpText',
  'field.shortText.placeholder',
  'field.shortText.minLength',
  'field.shortText.maxLength',
  'field.longText',
  'field.longText.placeholder',
  'field.longText.rows',
  'field.longText.minLength',
  'field.longText.maxLength',
  'field.rating.5.star',
  'field.rating.10.number',
  'field.rating.lowLabel',
  'field.rating.highLabel',
  'field.singleChoice.radio',
  'field.singleChoice.cards',
  'field.singleChoice.buttons',
  'field.singleChoice.option.description',
  'field.checkbox',
  'field.checkbox.initialValue',
  'field.attachments',
  'field.shared-controller-adapter',
  'field.adapter-instance-isolation',
  'field.required-focus',
  'field.attachment-bounds',
  'layout.field-span',
  'screen.message',
  'screen.form',
  'screen.screenshot.optional',
  'screen.screenshot.required',
  'screen.screenshot.auto',
  'screen.single-screenshot-bound',
  'presentation.modal.compact',
  'presentation.modal.default',
  'presentation.modal.wide',
  'presentation.columns.1',
  'presentation.columns.2',
  'appearance.theme.light',
  'appearance.theme.dark',
  'appearance.theme.auto',
  'appearance.accent',
  'appearance.density.compact',
  'appearance.density.comfortable',
  'content.action-copy',
  'content.success-copy',
  'content.cancel-copy',
  'presentation.responsive',
  'presentation.reduced-motion',
  'presentation.radix',
  'condition.answer',
  'condition.context',
  'condition.all',
  'condition.any',
  'condition.bounds',
  'condition.backward-only',
  'navigation.hidden-clearing',
  'navigation.back-retention',
  'navigation.nearest-visible',
  'navigation.progress',
  'navigation.async-suppression',
  'lifecycle.registration',
  'lifecycle.public-identity',
  'lifecycle.initial-answers',
  'lifecycle.preflight-retry',
  'lifecycle.preflight-race',
  'lifecycle.busy-open',
  'lifecycle.busy',
  'lifecycle.focus-trap-restore',
  'lifecycle.validation-aria',
  'lifecycle.submit-retry-success',
  'lifecycle.close-teardown',
  'output.title-interpolation',
  'output.title-bound',
  'output.classification.bug',
  'output.classification.feature',
  'output.classification.question',
  'output.format.text',
  'output.format.quote',
  'output.format.code',
  'output.format.stars',
  'output.format.choice',
  'output.omit-empty',
  'evidence.attachments',
  'evidence.console-logs',
  'evidence.submitter',
  'evidence.screenshot-selectors',
  'evidence.result-validation',
  'compatibility.classic-default',
] as const;

const EXACT_DEFERRED_SURFACE = ['unsupported.multi-select'] as const;

describe('canonical composable flow coverage matrix', () => {
  it('gives every supported primitive and state exactly one primary proof owner', () => {
    const identities = canonicalFlowCoverage.map(entry => entry.primitiveOrState);
    expect(new Set(identities).size).toBe(identities.length);
    expect(
      canonicalFlowCoverage
        .filter(entry => entry.gapStatus === 'covered')
        .map(entry => entry.primitiveOrState)
    ).toEqual(EXACT_COVERED_SURFACE);
    expect(
      canonicalFlowCoverage
        .filter(entry => entry.gapStatus === 'deferred-product')
        .map(entry => entry.primitiveOrState)
    ).toEqual(EXACT_DEFERRED_SURFACE);

    for (const entry of canonicalFlowCoverage) {
      expect(entry.publicContract.trim()).not.toBe('');
      expect(entry.expectedAssertion.trim()).not.toBe('');
      const [ownerFile, ownerAnchor, ...extra] = entry.proofOwner.split('#');
      expect(extra).toEqual([]);
      expect(ownerFile).toBeTruthy();
      expect(ownerAnchor).toBeTruthy();
      expect(existsSync(ownerFile!)).toBe(true);
      expect(readFileSync(ownerFile!, 'utf8')).toContain(ownerAnchor);
      if (entry.recipe) expect(flowRecipes[entry.recipe].id).toBe(entry.recipe);
      if (entry.proofLevel === 'focused') {
        expect(entry.artifactIdentity).toBe('source');
        expect(ownerFile).toMatch(/^test\//);
      }
      if (entry.proofLevel === 'local-browser') {
        expect(entry.artifactIdentity).toBe('local-widget');
        expect(ownerFile).toBe('e2e/public-flow.spec.ts');
      }
      if (entry.proofLevel === 'compatibility-control') {
        expect(entry.artifactIdentity).toBe('candidate-and-classic');
        expect(ownerFile).toMatch(/^(e2e\/|test\/ci-workflow-contract\.test\.sh$)/);
      }
      if (entry.recipe) expect(entry.proofLevel).toBe('local-browser');
    }
  });

  it('records true multi-select as deferred product work', () => {
    const deferred = canonicalFlowCoverage.filter(entry => entry.gapStatus === 'deferred-product');
    expect(deferred).toEqual([
      expect.objectContaining({
        primitiveOrState: 'unsupported.multi-select',
        recipe: null,
        publicContract: expect.stringContaining('not present'),
      }),
    ]);
    expect(
      Object.values(flowRecipes).some(recipe =>
        recipe.config.forms.some(form =>
          form.fields.some(field => (field as { type: string }).type === 'multiSelect')
        )
      )
    ).toBe(false);
  });
});
