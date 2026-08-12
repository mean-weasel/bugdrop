import { describe, expect, it } from 'vitest';
import {
  normalizeVariantDefinition,
  VARIANT_DEFINITION_ID,
} from '../src/widget/variants/flow-definition';
import type { VariantConfig } from '../src/widget/variants/public-types';
import { validateAndFreezeVariantConfig } from '../src/widget/variants/validate-config';

function config(presentation: VariantConfig['presentation']): VariantConfig {
  return {
    id: presentation.kind === 'modal' ? 'provider-question' : 'export-review',
    configVersion: 1,
    presentation,
    appearance: { theme: 'auto', accentColor: '#123456', density: 'comfortable' },
    content: { title: 'Private one-screen definition', submitLabel: 'Send' },
    fields: [{ id: 'response', type: 'longText', label: 'Response', required: true, rows: 4 }],
    issue: {
      classification: 'feedback',
      title: 'Response: {{response}}',
      sections: [{ heading: 'Response', field: 'response' }],
    },
  };
}

describe('private variant definition normalizer', () => {
  it.each([
    ['modal', { kind: 'modal', size: 'wide', columns: 2 }],
    ['inline', { kind: 'inline', columns: 1 }],
  ] as const)('normalizes a validated %s config into one immutable screen', (_, presentation) => {
    const validated = validateAndFreezeVariantConfig(config(presentation));
    const definition = normalizeVariantDefinition(validated);

    expect(definition).toEqual({
      id: VARIANT_DEFINITION_ID,
      variantId: validated.id,
      screens: [{ kind: 'variant', config: validated }],
    });
    expect(definition.screens).toHaveLength(1);
    expect(definition.screens[0]?.config).toBe(validated);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.screens)).toBe(true);
    expect(Object.isFrozen(definition.screens[0])).toBe(true);
    expect(Object.isFrozen(definition.screens[0]?.config)).toBe(true);
    expect(Object.isFrozen(definition.screens[0]?.config.fields)).toBe(true);
    expect(Object.isFrozen(definition.screens[0]?.config.fields[0])).toBe(true);
  });
});
