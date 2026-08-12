// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createFlowFormScreen } from '../src/widget/flows/form-screen';
import type { FlowForm } from '../src/widget/flows/public-types';

const form: FlowForm = {
  id: 'details',
  title: 'Details',
  fields: [
    { id: 'first', type: 'shortText', label: 'First', layout: { span: 2 } },
    { id: 'agree', type: 'checkbox', label: 'Agree', helpText: 'Required consent', required: true },
    { id: 'last', type: 'longText', label: 'Last' },
    {
      id: 'files',
      type: 'attachments',
      label: 'Files',
      helpText: 'Attach evidence',
      required: true,
    },
  ],
};

describe('flow form screen', () => {
  it('preserves declared order, layout, help relationships, and snapshots without required validation', async () => {
    const controller = createFlowFormScreen(form, 'instance', {
      'details.first': 'One',
      'details.last': 'Three',
    });
    const fields = [...controller.element.querySelectorAll<HTMLElement>('[data-bugdrop-field]')];
    expect(fields.map(field => field.dataset.bugdropField)).toEqual([
      'first',
      'agree',
      'last',
      'files',
    ]);
    expect(fields[0]?.dataset.span).toBe('2');
    const checkbox = controller.element.querySelector<HTMLInputElement>('#instance-agree')!;
    expect(checkbox.getAttribute('aria-describedby')).toContain('instance-agree-help');
    await expect(controller.snapshot()).resolves.toMatchObject({
      first: 'One',
      agree: false,
      last: 'Three',
      files: [],
    });
    expect(checkbox.getAttribute('aria-invalid')).toBeNull();
  });

  it('waits for file reads and exposes accessible read errors', async () => {
    const fileForm: FlowForm = {
      ...form,
      fields: form.fields.map(field =>
        field.id === 'files' ? { ...field, maxFileSize: 1 } : field
      ),
    };
    const controller = createFlowFormScreen(fileForm, 'instance', { 'details.agree': true });
    const input = controller.element.querySelector<HTMLInputElement>('#instance-files')!;
    Object.defineProperty(input, 'files', {
      value: [new File(['too large'], 'large.txt', { type: 'text/plain' })],
    });
    input.dispatchEvent(new Event('change'));
    await expect(controller.collect()).resolves.toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(controller.element.textContent).toContain('too large');
    vi.restoreAllMocks();
  });

  it('snapshots the last valid attachment after a read failure without accepting it forward', async () => {
    const previous = {
      name: 'previous.txt',
      type: 'text/plain',
      size: 1,
      dataUrl: 'data:text/plain;base64,eA==',
    };
    const fileForm: FlowForm = {
      ...form,
      fields: form.fields.map(field =>
        field.id === 'files' ? { ...field, maxFileSize: 1 } : field
      ),
    };
    const controller = createFlowFormScreen(fileForm, 'instance', {
      'details.agree': true,
      'details.files': [previous],
    });
    const input = controller.element.querySelector<HTMLInputElement>('#instance-files')!;
    Object.defineProperty(input, 'files', {
      value: [new File(['too large'], 'large.txt', { type: 'text/plain' })],
    });
    input.dispatchEvent(new Event('change'));

    await expect(controller.collect()).resolves.toBeNull();
    await expect(controller.snapshot()).resolves.toMatchObject({ files: [previous] });
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});
