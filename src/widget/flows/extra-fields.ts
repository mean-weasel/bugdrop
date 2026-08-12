import { isAllowedFlowAttachmentType, type FlowAttachment } from './field-validation';
import type { AttachmentsField, CheckboxField } from './public-types';

export interface ExtraFieldController {
  readonly id: string;
  readonly required: boolean;
  readonly element: HTMLElement;
  read(validate: boolean): Promise<{ ok: true; value: unknown } | { ok: false }>;
  setRequiredError(show: boolean): void;
  focus(): void;
  dispose(): void;
}

export function createCheckboxController(
  field: Readonly<CheckboxField>,
  formId: string,
  instanceId: string,
  answers: Readonly<Record<string, unknown>>
): ExtraFieldController {
  const scaffold = createScaffold(field, instanceId);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = scaffold.controlId;
  input.checked =
    typeof answers[`${formId}.${field.id}`] === 'boolean'
      ? Boolean(answers[`${formId}.${field.id}`])
      : Boolean(field.initialValue);
  input.setAttribute('aria-required', String(field.required ?? false));
  if (scaffold.describedBy) input.setAttribute('aria-describedby', scaffold.describedBy);
  scaffold.wrapper.classList.add('bdf-checkbox');
  scaffold.wrapper.insertBefore(input, scaffold.label);
  return {
    id: field.id,
    required: Boolean(field.required),
    element: scaffold.wrapper,
    read: async () => ({ ok: true, value: input.checked }),
    setRequiredError(show) {
      scaffold.setError(input, show ? 'This checkbox is required.' : null);
    },
    focus: () => input.focus(),
    dispose() {},
  };
}

export function createAttachmentsController(
  field: Readonly<AttachmentsField>,
  formId: string,
  instanceId: string,
  answers: Readonly<Record<string, unknown>>
): ExtraFieldController {
  const scaffold = createScaffold(field, instanceId);
  scaffold.wrapper.classList.add('bdf-attachment');
  const input = document.createElement('input');
  input.className = 'bdv-input';
  input.type = 'file';
  input.id = scaffold.controlId;
  input.multiple = (field.maxFiles ?? 5) > 1;
  input.setAttribute('aria-required', String(field.required ?? false));
  if (field.accept) input.accept = field.accept.join(',');
  if (scaffold.describedBy) input.setAttribute('aria-describedby', scaffold.describedBy);
  const list = document.createElement('ul');
  list.className = 'bdf-file-list';
  list.setAttribute('aria-live', 'polite');
  scaffold.wrapper.insertBefore(input, scaffold.error);
  scaffold.wrapper.insertBefore(list, scaffold.error);
  const initialValue = answers[`${formId}.${field.id}`];
  let values = Array.isArray(initialValue) ? ([...initialValue] as FlowAttachment[]) : [];
  let readFailed = false;
  let pending: Promise<void> = Promise.resolve();
  let readVersion = 0;
  renderNames(
    list,
    values.map(value => value.name)
  );
  const onChange = () => {
    const version = ++readVersion;
    readFailed = false;
    scaffold.setError(input, null);
    const files = Array.from(input.files ?? []);
    pending = readFiles(files, field)
      .then(next => {
        if (version !== readVersion) return;
        values = next;
        renderNames(
          list,
          next.map(value => value.name)
        );
      })
      .catch(error => {
        if (version !== readVersion) return;
        readFailed = true;
        scaffold.setError(
          input,
          error instanceof Error ? error.message : 'Could not read the selected attachment.'
        );
      });
  };
  input.addEventListener('change', onChange);
  return {
    id: field.id,
    required: Boolean(field.required),
    element: scaffold.wrapper,
    async read(validate) {
      while (true) {
        const currentRead = pending;
        await currentRead;
        if (currentRead === pending) break;
      }
      return readFailed && validate ? { ok: false } : { ok: true, value: values };
    },
    setRequiredError(show) {
      if (!readFailed) scaffold.setError(input, show ? 'Select at least one attachment.' : null);
    },
    focus: () => input.focus(),
    dispose: () => {
      readVersion += 1;
      input.removeEventListener('change', onChange);
    },
  };
}

interface ExtraScaffold {
  wrapper: HTMLDivElement;
  label: HTMLLabelElement;
  error: HTMLDivElement;
  controlId: string;
  describedBy: string | null;
  setError(target: HTMLElement, message: string | null): void;
}

function createScaffold(
  field: Readonly<CheckboxField | AttachmentsField>,
  instanceId: string
): ExtraScaffold {
  const wrapper = document.createElement('div');
  wrapper.className = 'bdv-field';
  wrapper.dataset.bugdropField = field.id;
  wrapper.dataset.span = String(field.layout?.span ?? 1);
  const controlId = `${instanceId}-${field.id}`;
  const label = document.createElement('label');
  label.className = 'bdv-label';
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
    help.id = `${controlId}-help`;
    help.textContent = field.helpText;
    wrapper.appendChild(help);
    describedBy.push(help.id);
  }
  const error = document.createElement('div');
  error.className = 'bdv-error';
  error.id = `${controlId}-error`;
  error.hidden = true;
  error.setAttribute('aria-live', 'polite');
  wrapper.appendChild(error);
  describedBy.push(error.id);
  return {
    wrapper,
    label,
    error,
    controlId,
    describedBy: describedBy.join(' ') || null,
    setError(target, message) {
      error.textContent = message ?? '';
      error.hidden = !message;
      if (message) target.setAttribute('aria-invalid', 'true');
      else target.removeAttribute('aria-invalid');
    },
  };
}

async function readFiles(
  files: File[],
  field: Readonly<AttachmentsField>
): Promise<FlowAttachment[]> {
  if (files.length > (field.maxFiles ?? 5))
    throw new TypeError(`Select at most ${field.maxFiles ?? 5} attachments.`);
  return Promise.all(
    files.map(file => readAttachment(file, field.maxFileSize ?? 5 * 1024 * 1024, field.accept))
  );
}

async function readAttachment(
  file: File,
  maxSize: number,
  accept: ReadonlyArray<string> | undefined
): Promise<FlowAttachment> {
  if (!isAllowedFlowAttachmentType(file.type))
    throw new TypeError(`${file.name} has an unsupported file type.`);
  if (accept && !accept.includes(file.type))
    throw new TypeError(`${file.name} is not an accepted file type.`);
  if (file.size > maxSize) throw new TypeError(`${file.name} is too large.`);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Could not read the selected attachment.'))
    );
    reader.addEventListener('error', () =>
      reject(new Error('Could not read the selected attachment.'))
    );
    reader.readAsDataURL(file);
  });
  return { name: file.name, type: file.type, size: file.size, dataUrl };
}

function renderNames(list: HTMLUListElement, names: string[]): void {
  list.replaceChildren(
    ...names.map(name => {
      const item = document.createElement('li');
      item.textContent = name;
      return item;
    })
  );
}
