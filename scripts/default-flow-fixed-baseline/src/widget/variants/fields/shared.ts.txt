import type { VariantField } from '../public-types';
import type { FieldScaffold } from './types';

export function createFieldScaffold(field: VariantField, instanceId: string): FieldScaffold {
  const wrapper = document.createElement('div');
  wrapper.className = 'bdv-field';
  wrapper.dataset.bugdropField = field.id;
  wrapper.dataset.span = String(field.layout?.span ?? 1);

  const controlId = `${instanceId}-${field.id}`;
  const labelId = `${controlId}-label`;
  const helpId = `${controlId}-help`;
  const errorId = `${controlId}-error`;

  const label = document.createElement('label');
  label.className = 'bdv-label';
  label.id = labelId;
  label.htmlFor = controlId;
  label.textContent = field.label;
  if (field.required) {
    const required = document.createElement('span');
    required.className = 'bdv-required';
    required.textContent = ' *';
    required.setAttribute('aria-hidden', 'true');
    label.appendChild(required);
  }
  wrapper.appendChild(label);

  const describedBy: string[] = [];
  if (field.helpText) {
    const help = document.createElement('div');
    help.className = 'bdv-help';
    help.id = helpId;
    help.textContent = field.helpText;
    wrapper.appendChild(help);
    describedBy.push(helpId);
  }

  const error = document.createElement('div');
  error.className = 'bdv-error';
  error.id = errorId;
  error.hidden = true;
  error.setAttribute('aria-live', 'polite');
  wrapper.appendChild(error);
  describedBy.push(errorId);

  return {
    wrapper,
    label,
    controlId,
    labelId,
    describedBy: describedBy.join(' ') || null,
    setError(target, message) {
      error.textContent = message ?? '';
      error.hidden = !message;
      if (message) target.setAttribute('aria-invalid', 'true');
      else target.removeAttribute('aria-invalid');
    },
  };
}

export function applyTextControlAttributes(
  control: HTMLInputElement | HTMLTextAreaElement,
  field: Extract<VariantField, { type: 'shortText' | 'longText' }>,
  scaffold: FieldScaffold
): void {
  control.id = scaffold.controlId;
  control.className = 'bdv-input';
  control.required = field.required ?? false;
  control.setAttribute('aria-required', String(field.required ?? false));
  if (scaffold.describedBy) control.setAttribute('aria-describedby', scaffold.describedBy);
  if (field.placeholder) control.placeholder = field.placeholder;
  control.minLength = field.minLength ?? 0;
  control.maxLength = field.maxLength ?? (field.type === 'shortText' ? 500 : 5_000);
  scaffold.wrapper.insertBefore(control, scaffold.wrapper.querySelector('.bdv-error'));
}
