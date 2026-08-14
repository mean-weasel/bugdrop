import type { ShortTextField } from '../public-types';
import { applyTextControlAttributes, createFieldScaffold } from './shared';
import type { FieldController } from './types';

export function createShortTextController(
  field: ShortTextField,
  instanceId: string
): FieldController {
  const scaffold = createFieldScaffold(field, instanceId);
  const input = document.createElement('input');
  input.type = 'text';
  applyTextControlAttributes(input, field, scaffold);

  return {
    field,
    element: scaffold.wrapper,
    getValue: () => input.value,
    setValue(value) {
      input.value = typeof value === 'string' ? value : '';
    },
    setError: message => scaffold.setError(input, message),
    setDisabled: disabled => {
      input.disabled = disabled;
    },
    focus: () => input.focus(),
    dispose() {},
  };
}
