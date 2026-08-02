import { assertKnownVariantAnswerKeys } from '../answer-validation';
import { createRuntimeId, createVariantForm } from '../form';
import { closeActiveVariantModal, setActiveVariantModal } from '../modal-coordinator';
import type {
  OpenedVariant,
  SubmissionResult,
  VariantConfig,
  VariantOpenOptions,
  VariantOutcome,
} from '../public-types';
import { createStyledVariantRoot } from '../styles';
import { installRadixDialogCompatibility } from '../../radix-compat';

interface ModalOpenInput {
  config: Readonly<VariantConfig>;
  options?: VariantOpenOptions;
  submit(
    answers: Record<string, unknown>,
    options: { context?: VariantOpenOptions['context']; submissionId?: string }
  ): Promise<SubmissionResult>;
}

export function openModalVariant(input: ModalOpenInput): OpenedVariant {
  if (input.config.presentation.kind !== 'modal') {
    throw new TypeError('BugDrop open() requires a modal variant');
  }
  assertKnownVariantAnswerKeys(input.config.fields, input.options?.initialAnswers ?? {});
  closeActiveVariantModal();

  const instanceId = createRuntimeId(input.config.id);
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const previousOverflow = document.body.style.getPropertyValue('overflow');
  const previousOverflowPriority = document.body.style.getPropertyPriority('overflow');
  const host = document.createElement('div');
  host.dataset.bugdropOwned = '';
  host.dataset.bugdropInstance = instanceId;
  Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '2147483646' });
  const shadow = host.attachShadow({ mode: 'open' });
  const styled = createStyledVariantRoot(shadow, input.config, 'modal');
  const overlay = document.createElement('div');
  overlay.className = 'bdv-overlay';
  styled.root.appendChild(overlay);

  let resolveOutcome!: (outcome: VariantOutcome) => void;
  const result = new Promise<VariantOutcome>(resolve => {
    resolveOutcome = resolve;
  });
  let settled = false;
  let closed = false;
  let unregisterActive = () => {};
  const settle = (outcome: VariantOutcome) => {
    if (settled) return;
    settled = true;
    resolveOutcome(outcome);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    settle({ status: 'closed' });
    unregisterActive();
    shadow.removeEventListener('keydown', handleKeydown);
    overlay.removeEventListener('pointerdown', handleBackdropPointerDown);
    form.dispose();
    disposeRadix();
    styled.dispose();
    host.remove();
    restoreBodyOverflow(previousOverflow, previousOverflowPriority);
    if (previousFocus?.isConnected) previousFocus.focus();
  };

  const form = createVariantForm({
    config: input.config,
    instanceId,
    context: input.options?.context,
    initialAnswers: input.options?.initialAnswers,
    submit: input.submit,
    cancel: { label: input.config.content.cancelLabel ?? 'Cancel', onCancel: close },
    onSubmitted: submission => settle({ status: 'submitted', result: submission }),
  });
  form.element.setAttribute('role', 'dialog');
  form.element.setAttribute('aria-modal', 'true');
  form.element.dataset.size = input.config.presentation.size ?? 'default';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'bdv-close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.textContent = '×';
  closeButton.addEventListener('click', close, { once: true });
  form.element.prepend(closeButton);
  overlay.appendChild(form.element);

  function handleKeydown(event: Event) {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = getFocusable(form.element);
    if (focusable.length === 0) {
      event.preventDefault();
      form.element.focus();
      return;
    }
    const active = shadow.activeElement;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && (active === first || !form.element.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
  function handleBackdropPointerDown(event: PointerEvent) {
    if (event.target === overlay) close();
  }

  document.body.style.setProperty('overflow', 'hidden');
  document.body.appendChild(host);
  const disposeRadix = installRadixDialogCompatibility(host);
  shadow.addEventListener('keydown', handleKeydown);
  overlay.addEventListener('pointerdown', handleBackdropPointerDown);
  const opened = Object.freeze({ instanceId, result, close });
  unregisterActive = setActiveVariantModal(opened);
  queueMicrotask(() => {
    if (closed) return;
    const preferred = form.element.querySelector<HTMLElement>(
      'textarea:not(:disabled), input:not(:disabled), [role="radio"][tabindex="0"]'
    );
    (preferred ?? getFocusable(form.element)[0] ?? form.element).focus();
  });
  return opened;
}

export function createBusyOpenedVariant(variantId: string): OpenedVariant {
  return Object.freeze({
    instanceId: createRuntimeId(variantId),
    result: Promise.resolve<VariantOutcome>({ status: 'busy' }),
    close() {},
  });
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
    )
  ).filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

function restoreBodyOverflow(value: string, priority: string): void {
  if (value) document.body.style.setProperty('overflow', value, priority);
  else document.body.style.removeProperty('overflow');
}
