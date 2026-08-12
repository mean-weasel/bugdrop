import { createStyledVariantRoot } from '../variants/styles';
import type { VariantConfig } from '../variants/public-types';
import type { FlowConfig } from './public-types';

export function createStyledFlowRoot(shadow: ShadowRoot, config: Readonly<FlowConfig>) {
  const adapter: Readonly<VariantConfig> = {
    id: config.id,
    presentation: config.presentation,
    appearance: config.appearance,
    content: { title: config.id },
    fields: [{ id: 'placeholder', type: 'shortText', label: 'Placeholder' }],
    issue: { title: config.id },
  };
  const styled = createStyledVariantRoot(shadow, adapter, 'modal');
  const extra = document.createElement('style');
  extra.textContent = `
    .bdf-progress { margin: 0 0 12px; color: var(--bdv-text-muted); font-size: .8rem; }
    .bdf-message { min-height: 180px; display: grid; align-content: center; }
    .bdf-attachment { display: grid; gap: 7px; }
    .bdf-checkbox { display: flex; min-height: 44px; align-items: center; gap: 10px; }
    .bdf-checkbox input { width: 20px; height: 20px; accent-color: var(--bdv-accent); }
    .bdf-file-list { margin: 0; padding-left: 20px; color: var(--bdv-text-muted); }
    .bdf-back { order: -1; }
  `;
  shadow.prepend(extra);
  return {
    root: styled.root,
    dispose() {
      extra.remove();
      styled.dispose();
    },
  };
}
