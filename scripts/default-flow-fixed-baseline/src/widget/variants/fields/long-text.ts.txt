import type { LongTextField } from '../public-types';
import { applyTextControlAttributes, createFieldScaffold } from './shared';
import type { FieldController } from './types';

export function createLongTextController(
  field: LongTextField,
  instanceId: string
): FieldController {
  const scaffold = createFieldScaffold(field, instanceId);
  const textarea = document.createElement('textarea');
  textarea.rows = field.rows ?? 4;
  applyTextControlAttributes(textarea, field, scaffold);

  return {
    field,
    element: scaffold.wrapper,
    getValue: () => textarea.value,
    setValue(value) {
      textarea.value = typeof value === 'string' ? value : '';
    },
    setError: message => scaffold.setError(textarea, message),
    setDisabled: disabled => {
      textarea.disabled = disabled;
    },
    focus: () => textarea.focus(),
    dispose() {},
  };
}
