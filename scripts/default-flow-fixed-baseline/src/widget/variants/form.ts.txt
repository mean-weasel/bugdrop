import {
  assertKnownVariantAnswerKeys,
  normalizeVariantAnswers,
  VariantAnswerError,
} from './answer-validation';
import { createFieldController } from './fields';
import type {
  HeadlessSubmitOptions,
  SubmissionResult,
  VariantConfig,
  VariantContext,
} from './public-types';

interface VariantFormOptions {
  config: Readonly<VariantConfig>;
  instanceId: string;
  context?: VariantContext;
  initialAnswers?: Record<string, unknown>;
  submit(
    answers: Record<string, unknown>,
    options: HeadlessSubmitOptions
  ): Promise<SubmissionResult>;
  cancel?: { label: string; onCancel(): void };
  onSubmitted?(result: SubmissionResult): void;
}

interface VariantFormController {
  readonly element: HTMLElement;
  reset(): void;
  dispose(): void;
}

export function createVariantForm(options: VariantFormOptions): VariantFormController {
  const { config, instanceId } = options;
  const context = { ...(options.context ?? {}) };
  const initialAnswers = { ...(options.initialAnswers ?? {}) };
  assertKnownVariantAnswerKeys(config.fields, initialAnswers);

  const surface = document.createElement('section');
  surface.className = 'bdv-surface';
  const titleId = `${instanceId}-title`;
  surface.setAttribute('aria-labelledby', titleId);

  const header = document.createElement('div');
  header.className = 'bdv-header';
  const title = document.createElement('h2');
  title.className = 'bdv-title';
  title.id = titleId;
  title.textContent = config.content.title;
  header.appendChild(title);
  if (config.content.description) {
    const description = document.createElement('p');
    description.className = 'bdv-description';
    description.textContent = config.content.description;
    header.appendChild(description);
  }
  surface.appendChild(header);

  const form = document.createElement('form');
  form.className = 'bdv-form';
  form.noValidate = true;
  const fieldsElement = document.createElement('div');
  fieldsElement.className = 'bdv-fields';
  const controllers = config.fields.map(field => createFieldController(field, instanceId));
  for (const controller of controllers) fieldsElement.appendChild(controller.element);
  form.appendChild(fieldsElement);

  const actions = document.createElement('div');
  actions.className = 'bdv-actions';
  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'bdv-submit';
  submitButton.textContent = config.content.submitLabel ?? 'Submit';
  actions.appendChild(submitButton);
  let cancelButton: HTMLButtonElement | undefined;
  if (options.cancel) {
    cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'bdv-cancel';
    cancelButton.textContent = options.cancel.label;
    cancelButton.addEventListener('click', options.cancel.onCancel);
    actions.appendChild(cancelButton);
  }
  form.appendChild(actions);

  const status = document.createElement('p');
  status.className = 'bdv-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  form.appendChild(status);
  surface.appendChild(form);

  const { success, successLink } = createSuccessState(config);
  surface.appendChild(success);

  let submissionId = createRuntimeId('submission');
  let busy = false;
  let disposed = false;

  const setBusy = (value: boolean) => {
    busy = value;
    form.setAttribute('aria-busy', String(value));
    submitButton.disabled = value;
    if (cancelButton) cancelButton.disabled = value;
    for (const controller of controllers) controller.setDisabled(value);
  };
  const clearErrors = () => {
    status.textContent = '';
    status.removeAttribute('data-kind');
    for (const controller of controllers) controller.setError(null);
  };
  const applyInitialAnswers = () => {
    for (const controller of controllers) {
      controller.setValue(initialAnswers[controller.field.id] ?? '');
    }
  };
  const collectAnswers = () =>
    Object.fromEntries(controllers.map(controller => [controller.field.id, controller.getValue()]));

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (busy || disposed) return;
    clearErrors();

    let answers: Record<string, string | number>;
    try {
      answers = normalizeVariantAnswers(config.fields, collectAnswers());
    } catch (error) {
      if (error instanceof VariantAnswerError && error.fieldId) {
        const controller = controllers.find(candidate => candidate.field.id === error.fieldId);
        controller?.setError(readableFieldError(error));
        controller?.focus();
      } else {
        status.textContent = error instanceof Error ? error.message : 'Please check your response.';
        status.dataset.kind = 'error';
      }
      return;
    }

    setBusy(true);
    status.textContent = 'Submitting…';
    try {
      const result = await options.submit(answers, { context, submissionId });
      if (disposed) return;
      setBusy(false);
      successLink.hidden = !result.isPublic;
      if (result.isPublic) successLink.href = result.issueUrl;
      form.hidden = true;
      success.hidden = false;
      success.focus();
      options.onSubmitted?.(result);
    } catch (error) {
      if (disposed) return;
      status.textContent = error instanceof Error ? error.message : 'Failed to submit feedback.';
      status.dataset.kind = 'error';
      setBusy(false);
    }
  };
  const preventImplicitSubmit = (event: KeyboardEvent) => {
    if (
      event.key === 'Enter' &&
      event.target instanceof HTMLInputElement &&
      event.target.type !== 'submit'
    ) {
      event.preventDefault();
    }
  };
  form.addEventListener('submit', handleSubmit);
  form.addEventListener('keydown', preventImplicitSubmit);
  applyInitialAnswers();

  return {
    element: surface,
    reset() {
      if (busy || disposed) return;
      submissionId = createRuntimeId('submission');
      clearErrors();
      applyInitialAnswers();
      success.hidden = true;
      successLink.removeAttribute('href');
      form.hidden = false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      form.removeEventListener('submit', handleSubmit);
      form.removeEventListener('keydown', preventImplicitSubmit);
      if (cancelButton && options.cancel) {
        cancelButton.removeEventListener('click', options.cancel.onCancel);
      }
      for (const controller of controllers) controller.dispose();
    },
  };
}

export function createRuntimeId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error(
      'BugDrop rendered variants require a cryptographically secure random generator'
    );
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `${prefix}-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function createSuccessState(config: Readonly<VariantConfig>) {
  const success = document.createElement('div');
  success.className = 'bdv-success';
  success.hidden = true;
  success.tabIndex = -1;
  const title = document.createElement('h3');
  title.className = 'bdv-success-title';
  title.textContent = config.content.successTitle ?? 'Thanks for your feedback!';
  const message = document.createElement('p');
  message.className = 'bdv-success-message';
  message.textContent = config.content.successMessage ?? 'Your response was submitted.';
  const successLink = document.createElement('a');
  successLink.className = 'bdv-success-link';
  successLink.textContent = 'View GitHub Issue';
  successLink.target = '_blank';
  successLink.rel = 'noopener noreferrer';
  success.append(title, message, successLink);
  return { success, successLink };
}

function readableFieldError(error: VariantAnswerError): string {
  if (!error.fieldId) return error.message;
  const prefix = `Answer ${error.fieldId} `;
  const detail = error.message.startsWith(prefix)
    ? error.message.slice(prefix.length)
    : error.message;
  return detail.charAt(0).toUpperCase() + detail.slice(1);
}
