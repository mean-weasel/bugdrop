import type {
  VariantConfig,
  VariantHandle,
  VariantMountOptions,
  VariantOpenOptions,
} from './public-types';
import { normalizeVariantDefinition, type VariantDefinition } from './flow-definition';
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
  const variants = new Map<string, VariantDefinition>();

  return {
    register(config) {
      const normalized = validateAndFreezeVariantConfig(config);
      if (variants.has(normalized.id)) {
        throw new TypeError(`BugDrop variant is already registered: ${normalized.id}`);
      }
      const definition = normalizeVariantDefinition(normalized);
      variants.set(normalized.id, definition);

      const screen = definition.screens[0];
      const screenConfig = screen.config;
      const submitFromDefinition = (
        answers: Record<string, unknown>,
        options: Parameters<typeof submitVariant>[3] = {}
      ) => submitVariant(transport, screenConfig, answers, options);

      return Object.freeze({
        id: definition.variantId,
        open(options?: VariantOpenOptions) {
          if (screenConfig.presentation.kind !== 'modal') {
            throw new TypeError('BugDrop open() requires a modal variant');
          }
          if (runtime.isLegacyModalOpen()) return createBusyOpenedVariant(definition.variantId);
          return openModalVariant({
            config: screenConfig,
            options,
            submit: submitFromDefinition,
          });
        },
        mount(target: HTMLElement, options?: VariantMountOptions) {
          return mountInlineVariant({
            config: screenConfig,
            target,
            options,
            submit: submitFromDefinition,
          });
        },
        submit(answers: Record<string, unknown>, options = {}) {
          return submitFromDefinition(answers, options);
        },
      });
    },
  };
}
