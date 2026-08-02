import type { VariantConfig, VariantHandle } from './public-types';
import { validateAndFreezeVariantConfig } from './validate-config';
import { submitVariant, type VariantTransportConfig } from './submission';

export interface VariantManager {
  register(config: VariantConfig): VariantHandle;
}

export function createVariantManager(transport: VariantTransportConfig): VariantManager {
  const variants = new Map<string, Readonly<VariantConfig>>();

  return {
    register(config) {
      const normalized = validateAndFreezeVariantConfig(config);
      if (variants.has(normalized.id)) {
        throw new TypeError(`BugDrop variant is already registered: ${normalized.id}`);
      }
      variants.set(normalized.id, normalized);

      return Object.freeze({
        id: normalized.id,
        open() {
          throw new Error('BugDrop rendered variants are not available in the headless foundation');
        },
        mount() {
          throw new Error('BugDrop rendered variants are not available in the headless foundation');
        },
        submit(answers: Record<string, unknown>, options = {}) {
          return submitVariant(transport, normalized, answers, options);
        },
      });
    },
  };
}
