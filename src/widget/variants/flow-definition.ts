import type { VariantConfig } from './public-types';

export const VARIANT_DEFINITION_ID = 'bugdrop-variant@1' as const;

export interface VariantDefinition {
  readonly id: typeof VARIANT_DEFINITION_ID;
  readonly variantId: string;
  readonly screens: readonly [
    Readonly<{
      kind: 'variant';
      config: Readonly<VariantConfig>;
    }>,
  ];
}

export function normalizeVariantDefinition(config: Readonly<VariantConfig>): VariantDefinition {
  const screen = Object.freeze({ kind: 'variant' as const, config });
  const screens = Object.freeze([screen]) as VariantDefinition['screens'];

  return Object.freeze({
    id: VARIANT_DEFINITION_ID,
    variantId: config.id,
    screens,
  });
}
