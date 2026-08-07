// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVariantForm } from '../src/widget/variants/form';
import type { SubmissionResult, VariantConfig } from '../src/widget/variants/public-types';

const config: VariantConfig = {
  id: 'question',
  presentation: { kind: 'modal' },
  content: { title: 'Ask a question', cancelLabel: 'Cancel' },
  fields: [{ id: 'response', type: 'longText', label: 'Response', required: true }],
  issue: { title: 'Question: {{response}}' },
};

const result: SubmissionResult = {
  issueNumber: 12,
  issueUrl: 'https://github.com/owner/repo/issues/12',
  isPublic: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function submit(form: HTMLFormElement): void {
  form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
}

describe('variant form lifecycle', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
      .mockReturnValue('00000000-0000-4000-8000-000000000003');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('suppresses duplicate submissions while busy and exposes one successful transition', async () => {
    const pending = deferred<SubmissionResult>();
    const onSubmitted = vi.fn();
    const onCancel = vi.fn();
    const submitRequest = vi.fn().mockReturnValue(pending.promise);
    const controller = createVariantForm({
      config,
      instanceId: 'form-1',
      context: { account_id: 'acct-1' },
      initialAnswers: { response: '  Help  ' },
      submit: submitRequest,
      cancel: { label: 'Not now', onCancel },
      onSubmitted,
    });
    document.body.appendChild(controller.element);
    const form = controller.element.querySelector('form')!;

    submit(form);
    submit(form);
    expect(submitRequest).toHaveBeenCalledTimes(1);
    expect(submitRequest).toHaveBeenCalledWith(
      { response: 'Help' },
      {
        context: { account_id: 'acct-1' },
        submissionId: 'submission-00000000-0000-4000-8000-000000000001',
      }
    );
    expect(form.getAttribute('aria-busy')).toBe('true');
    expect(controller.element.querySelector<HTMLButtonElement>('.bdv-submit')?.disabled).toBe(true);
    expect(controller.element.querySelector<HTMLButtonElement>('.bdv-cancel')?.disabled).toBe(true);
    expect(controller.element.querySelector('textarea')?.disabled).toBe(true);

    pending.resolve(result);
    await pending.promise;
    await Promise.resolve();
    expect(form.hidden).toBe(true);
    expect(controller.element.querySelector<HTMLElement>('.bdv-success')?.hidden).toBe(false);
    expect(controller.element.querySelector<HTMLAnchorElement>('.bdv-success-link')?.href).toBe(
      result.issueUrl
    );
    expect(onSubmitted).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('surfaces a failure, permits retry with the same id, and reset restores initial state with a new id', async () => {
    const submitRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error('Temporary outage'))
      .mockResolvedValue(result);
    const controller = createVariantForm({
      config,
      instanceId: 'form-2',
      initialAnswers: { response: 'Initial answer' },
      submit: submitRequest,
    });
    document.body.appendChild(controller.element);
    const form = controller.element.querySelector('form')!;
    const textarea = controller.element.querySelector<HTMLTextAreaElement>('textarea')!;

    textarea.value = 'First attempt';
    submit(form);
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.element.querySelector('.bdv-status')?.textContent).toBe('Temporary outage');
    expect(controller.element.querySelector('.bdv-status')?.getAttribute('data-kind')).toBe(
      'error'
    );
    expect(textarea.disabled).toBe(false);

    textarea.value = 'Second attempt';
    submit(form);
    await Promise.resolve();
    await Promise.resolve();
    expect(submitRequest).toHaveBeenCalledTimes(2);
    expect(submitRequest.mock.calls[0]?.[1]).toEqual(submitRequest.mock.calls[1]?.[1]);

    controller.reset();
    expect(form.hidden).toBe(false);
    expect(controller.element.querySelector<HTMLElement>('.bdv-success')?.hidden).toBe(true);
    expect(
      controller.element.querySelector<HTMLAnchorElement>('.bdv-success-link')?.hasAttribute('href')
    ).toBe(false);
    expect(textarea.value).toBe('Initial answer');

    textarea.value = 'After reset';
    submit(form);
    await Promise.resolve();
    expect(submitRequest.mock.calls[2]?.[1]?.submissionId).toBe(
      'submission-00000000-0000-4000-8000-000000000002'
    );
  });

  it('cancels only while active and disposal removes submit, cancel, and keyboard listeners', async () => {
    const pending = deferred<SubmissionResult>();
    const submitRequest = vi.fn().mockReturnValue(pending.promise);
    const onCancel = vi.fn();
    const onSubmitted = vi.fn();
    const controller = createVariantForm({
      config,
      instanceId: 'form-3',
      initialAnswers: { response: 'Answer' },
      submit: submitRequest,
      cancel: { label: 'Cancel', onCancel },
      onSubmitted,
    });
    document.body.appendChild(controller.element);
    const form = controller.element.querySelector('form')!;
    const cancel = controller.element.querySelector<HTMLButtonElement>('.bdv-cancel')!;
    const textarea = controller.element.querySelector<HTMLTextAreaElement>('textarea')!;

    cancel.click();
    expect(onCancel).toHaveBeenCalledOnce();
    submit(form);
    controller.dispose();
    controller.dispose();
    cancel.disabled = false;
    cancel.click();
    submit(form);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    textarea.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(submitRequest).toHaveBeenCalledOnce();

    pending.resolve(result);
    await pending.promise;
    await Promise.resolve();
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(controller.element.querySelector<HTMLElement>('.bdv-success')?.hidden).toBe(true);
  });

  it('keeps reset inert while busy or after disposal', () => {
    const pending = deferred<SubmissionResult>();
    const controller = createVariantForm({
      config,
      instanceId: 'form-4',
      initialAnswers: { response: 'Initial' },
      submit: () => pending.promise,
    });
    document.body.appendChild(controller.element);
    const form = controller.element.querySelector('form')!;
    const textarea = controller.element.querySelector<HTMLTextAreaElement>('textarea')!;
    textarea.value = 'Busy value';
    submit(form);
    controller.reset();
    expect(textarea.value).toBe('Busy value');

    controller.dispose();
    textarea.value = 'Disposed value';
    controller.reset();
    expect(textarea.value).toBe('Disposed value');
  });
});
