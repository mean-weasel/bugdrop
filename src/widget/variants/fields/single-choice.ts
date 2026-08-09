import type { SingleChoiceField } from '../public-types';
import { createFieldScaffold } from './shared';
import type { FieldController } from './types';

export function createSingleChoiceController(
  field: SingleChoiceField,
  instanceId: string
): FieldController {
  const scaffold = createFieldScaffold(field, instanceId);
  const group = document.createElement('div');
  group.className = `choice ${field.display ?? ''}`;
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-labelledby', scaffold.labelId);
  group.setAttribute('aria-required', String(field.required ?? false));
  if (scaffold.describedBy) group.setAttribute('aria-describedby', scaffold.describedBy);

  const inputs = field.options.map(option => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = scaffold.controlId;
    input.value = option.value;
    label.append(input, option.label);
    if (option.description) {
      const description = document.createElement('span');
      description.className = 'bdv-help';
      description.textContent = option.description;
      label.appendChild(description);
    }
    group.appendChild(label);
    return input;
  });
  scaffold.wrapper.insertBefore(group, scaffold.wrapper.querySelector('.bdv-error'));
  const selected = () => group.querySelector<HTMLInputElement>(':checked');

  return {
    field,
    element: scaffold.wrapper,
    getValue: () => selected()?.value ?? '',
    setValue(value) {
      for (const input of inputs) input.checked = input.value === value;
    },
    setError: message => scaffold.setError(group, message),
    setDisabled(disabled) {
      for (const input of inputs) input.disabled = disabled;
    },
    focus() {
      (selected() ?? inputs[0])?.focus();
    },
    dispose() {},
  };
}
