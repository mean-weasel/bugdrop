import type {
  VariantConfig,
  VariantHandle,
  VariantMountOptions,
  VariantOpenOptions,
} from './public-types';
import { mountInlineVariant } from './presentations/inline';
import { createBusyOpenedVariant, openModalVariant } from './presentations/modal';
import { validateAndFreezeVariantConfig } from './validate-config';
import { submitVariant, type VariantTransportConfig } from './submission';

export interface VariantManager {
  register(config: VariantConfig): VariantHandle;
}

export function createVariantManager(
  transport: VariantTransportConfig,
  runtime: { isLegacyModalOpen(): boolean } = { isLegacyModalOpen: () => false }
): VariantManager {
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
        open(options?: VariantOpenOptions) {
          if (normalized.presentation.kind !== 'modal') {
            throw new TypeError('BugDrop open() requires a modal variant');
          }
          if (runtime.isLegacyModalOpen()) return createBusyOpenedVariant(normalized.id);
          return openModalVariant({
            config: normalized,
            options,
            submit: (answers, submitOptions) =>
              submitVariant(transport, normalized, answers, submitOptions),
          });
        },
        mount(target: HTMLElement, options?: VariantMountOptions) {
          return mountInlineVariant({
            config: normalized,
            target,
            options,
            submit: (answers, submitOptions) =>
              submitVariant(transport, normalized, answers, submitOptions),
          });
        },
        submit(answers: Record<string, unknown>, options = {}) {
          return submitVariant(transport, normalized, answers, options);
        },
      });
    },
  };
}
