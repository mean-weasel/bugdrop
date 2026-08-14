import { assertKnownVariantAnswerKeys } from '../answer-validation';
import { createRuntimeId, createVariantForm } from '../form';
import type {
  MountedVariant,
  VariantConfig,
  VariantMountOptions,
  SubmissionResult,
} from '../public-types';
import { createStyledVariantRoot } from '../styles';
import { installRadixDialogCompatibility } from '../../radix-compat';

interface InlineMountOptions {
  config: Readonly<VariantConfig>;
  target: HTMLElement;
  options?: VariantMountOptions;
  submit(
    answers: Record<string, unknown>,
    options: { context?: VariantMountOptions['context']; submissionId?: string }
  ): Promise<SubmissionResult>;
}

export function mountInlineVariant(input: InlineMountOptions): MountedVariant {
  if (!(input.target instanceof HTMLElement)) {
    throw new TypeError('BugDrop inline variant target must be an HTMLElement');
  }
  if (input.config.presentation.kind !== 'inline') {
    throw new TypeError('BugDrop mount() requires an inline variant');
  }
  assertKnownVariantAnswerKeys(input.config.fields, input.options?.initialAnswers ?? {});

  const instanceId = createRuntimeId(input.config.id);
  const host = document.createElement('div');
  host.dataset.bugdropOwned = '';
  host.dataset.bugdropInstance = instanceId;
  const shadow = host.attachShadow({ mode: 'open' });
  const disposeRadix = installRadixDialogCompatibility(host);
  const styled = createStyledVariantRoot(shadow, input.config, 'inline');
  const form = createVariantForm({
    config: input.config,
    instanceId,
    context: input.options?.context,
    initialAnswers: input.options?.initialAnswers,
    submit: input.submit,
  });
  styled.root.appendChild(form.element);
  input.target.appendChild(host);

  let unmounted = false;
  return Object.freeze({
    instanceId,
    reset() {
      if (!unmounted) form.reset();
    },
    unmount() {
      if (unmounted) return;
      unmounted = true;
      form.dispose();
      disposeRadix();
      styled.dispose();
      host.remove();
    },
  });
}
