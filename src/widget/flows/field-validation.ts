import type { FlowDefinition } from './definition';
import type {
  AttachmentsField,
  FlowField,
  FlowConfig,
  FlowOpenOptions,
  FlowScalar,
} from './public-types';

export interface FlowAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

export function isAllowedFlowAttachmentType(value: string): boolean {
  return ALLOWED_ATTACHMENT_TYPES.has(value);
}

export interface NormalizedFlowOpenOptions {
  context: Readonly<Record<string, FlowScalar>>;
  initialAnswers: Record<string, unknown>;
}

export function normalizeFlowOpenOptions(
  definition: FlowDefinition,
  options: FlowOpenOptions | undefined
): NormalizedFlowOpenOptions {
  const declaredOptions = options;
  if (options !== undefined && !isObject(options)) fail('open options must be an object');
  assertOnlyKeys(options ?? {}, new Set(['context', 'initialAnswers']), 'open options');
  return {
    context: Object.freeze(normalizeContext(definition, declaredOptions?.context)),
    initialAnswers: normalizeInitialAnswers(definition, declaredOptions?.initialAnswers),
  };
}

export function validateFlowFieldConfig(field: FlowField): void {
  validateLayout(field);
  if (field.type === 'shortText' || field.type === 'longText') validateTextField(field);
  else if (field.type === 'rating') validateRatingField(field);
  else if (field.type === 'singleChoice') validateChoiceField(field);
  else if (field.type === 'checkbox') validateCheckboxField(field);
  else validateAttachmentsField(field);
}

export function validateFlowConditionValue(field: FlowField, value: FlowScalar): void {
  if (field.type === 'rating') {
    const scale = field.scale ?? 5;
    if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > scale)
      fail(`condition equals is not a valid value for field ${field.id}`);
    return;
  }
  if (field.type === 'singleChoice') {
    if (typeof value !== 'string' || !field.options.some(option => option.value === value))
      fail(`condition equals is not a valid value for field ${field.id}`);
    return;
  }
  if (field.type === 'checkbox') {
    if (typeof value !== 'boolean')
      fail(`condition equals is not a valid value for field ${field.id}`);
    return;
  }
  if (field.type === 'attachments')
    fail(`condition answer cannot reference attachments field ${field.id}`);
  if (typeof value !== 'string' || value !== value.trim())
    fail(`condition equals is not a valid value for field ${field.id}`);
  const minimum = field.minLength ?? 0;
  const maximum = field.maxLength ?? (field.type === 'shortText' ? 500 : 5_000);
  if (value.length < minimum || value.length > maximum)
    fail(`condition equals is not a valid value for field ${field.id}`);
}

export function validateFlowShell(config: FlowConfig): void {
  const { presentation, appearance, content } = config;
  if (!isObject(presentation)) fail('presentation must be an object');
  assertOnlyKeys(presentation, new Set(['kind', 'size', 'columns']), 'presentation');
  if (presentation.kind !== 'modal') fail('presentation kind must be modal');
  if (
    presentation.size !== undefined &&
    !['compact', 'default', 'wide'].includes(presentation.size)
  )
    fail('modal size is invalid');
  if (
    presentation.columns !== undefined &&
    presentation.columns !== 1 &&
    presentation.columns !== 2
  )
    fail('presentation columns must be 1 or 2');
  if (appearance !== undefined) {
    if (!isObject(appearance)) fail('appearance must be an object');
    assertOnlyKeys(appearance, new Set(['theme', 'accentColor', 'density']), 'appearance');
    if (appearance.theme !== undefined && !['light', 'dark', 'auto'].includes(appearance.theme))
      fail('appearance theme is invalid');
    optionalCopy(appearance.accentColor, 'appearance accentColor', 120);
    if (
      appearance.density !== undefined &&
      !['compact', 'comfortable'].includes(appearance.density)
    )
      fail('appearance density is invalid');
  }
  if (content !== undefined) {
    if (!isObject(content)) fail('content must be an object');
    assertOnlyKeys(content, new Set(['successTitle', 'successMessage', 'cancelLabel']), 'content');
    optionalCopy(content.successTitle, 'successTitle', 500);
    optionalCopy(content.successMessage, 'successMessage', 2_000);
    optionalCopy(content.cancelLabel, 'cancelLabel', 120);
  }
}

function normalizeFlowFieldValue(field: Readonly<FlowField>, raw: unknown): unknown {
  if (field.type === 'shortText' || field.type === 'longText') {
    if (typeof raw !== 'string') fail(`initial answer ${field.id} must be text`);
    const minimum = field.minLength ?? 0;
    const maximum = field.maxLength ?? (field.type === 'shortText' ? 500 : 5_000);
    const value = raw.trim();
    if (value.length < minimum || value.length > maximum)
      fail(`initial answer ${field.id} has invalid length`);
    return value;
  }
  if (field.type === 'rating') {
    const scale = field.scale ?? 5;
    if (!Number.isInteger(raw) || (raw as number) < 1 || (raw as number) > scale)
      fail(`initial answer ${field.id} must be a rating from 1-${scale}`);
    return raw;
  }
  if (field.type === 'singleChoice') {
    if (typeof raw !== 'string' || !field.options.some(option => option.value === raw))
      fail(`initial answer ${field.id} must be a configured choice`);
    return raw;
  }
  if (field.type === 'checkbox') {
    if (typeof raw !== 'boolean') fail(`initial answer ${field.id} must be boolean`);
    return raw;
  }
  return normalizeAttachments(field, raw);
}

function normalizeContext(
  definition: FlowDefinition,
  raw: FlowOpenOptions['context']
): Record<string, FlowScalar> {
  if (raw !== undefined && !isObject(raw)) fail('context must be an object');
  const context = raw ?? {};
  const unknown = Object.keys(context).find(key => !definition.contextKeys.has(key));
  if (unknown) fail(`context contains unknown key ${unknown}`);
  const output: Record<string, FlowScalar> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!isScalar(value) || (typeof value === 'number' && !Number.isFinite(value)))
      fail(`context ${key} must be a finite scalar`);
    output[key] = value;
  }
  return output;
}

function normalizeInitialAnswers(
  definition: FlowDefinition,
  raw: FlowOpenOptions['initialAnswers']
): Record<string, unknown> {
  if (raw !== undefined && !isObject(raw)) fail('initialAnswers must be an object');
  const answers = raw ?? {};
  const unknown = Object.keys(answers).find(key => !definition.fields.has(key));
  if (unknown) fail(`initialAnswers contains unknown key ${unknown}`);
  return Object.fromEntries(
    Object.entries(answers).map(([path, value]) => [
      path,
      normalizeFlowFieldValue(definition.fields.get(path)!, value),
    ])
  );
}

function validateLayout(field: FlowField): void {
  if (field.layout === undefined) return;
  if (!isObject(field.layout)) fail(`field ${field.id} layout must be an object`);
  assertOnlyKeys(field.layout, new Set(['span']), `field ${field.id} layout`);
  if (field.layout.span !== undefined && field.layout.span !== 1 && field.layout.span !== 2)
    fail(`field ${field.id} layout span must be 1 or 2`);
}

function validateTextField(field: Extract<FlowField, { type: 'shortText' | 'longText' }>): void {
  optionalCopy(field.placeholder, `field ${field.id} placeholder`, 500);
  const minimum = field.minLength ?? 0;
  const maximum = field.maxLength ?? (field.type === 'shortText' ? 500 : 5_000);
  if (!boundedInteger(minimum, 0, 5_000) || !boundedInteger(maximum, 1, 5_000) || minimum > maximum)
    fail(`field ${field.id} has invalid text bounds`);
  if (field.type === 'longText' && field.rows !== undefined && !boundedInteger(field.rows, 1, 50))
    fail(`field ${field.id} rows must be 1-50`);
}

function validateRatingField(field: Extract<FlowField, { type: 'rating' }>): void {
  if (field.scale !== undefined && field.scale !== 5 && field.scale !== 10)
    fail(`field ${field.id} rating scale must be 5 or 10`);
  if (field.icon !== undefined && field.icon !== 'star' && field.icon !== 'number')
    fail(`field ${field.id} rating icon is invalid`);
  optionalCopy(field.lowLabel, `field ${field.id} lowLabel`, 500);
  optionalCopy(field.highLabel, `field ${field.id} highLabel`, 500);
}

function validateChoiceField(field: Extract<FlowField, { type: 'singleChoice' }>): void {
  if (!Array.isArray(field.options) || field.options.length < 2 || field.options.length > 50)
    fail(`field ${field.id} requires 2-50 choices`);
  if (field.display !== undefined && !['radio', 'cards', 'buttons'].includes(field.display))
    fail(`field ${field.id} choice display is invalid`);
  const values = new Set<string>();
  for (const option of field.options) {
    if (!isObject(option)) fail(`field ${field.id} has an invalid choice`);
    assertOnlyKeys(option, new Set(['value', 'label', 'description']), `field ${field.id} choice`);
    requiredCopy(option.value, `field ${field.id} choice value`, 120);
    requiredCopy(option.label, `field ${field.id} choice label`, 500);
    optionalCopy(option.description, `field ${field.id} choice description`, 1_000);
    if (values.has(option.value)) fail(`field ${field.id} has duplicate choices`);
    values.add(option.value);
  }
}

function validateCheckboxField(field: Extract<FlowField, { type: 'checkbox' }>): void {
  if (field.initialValue !== undefined && typeof field.initialValue !== 'boolean')
    fail(`field ${field.id} initialValue must be boolean`);
}

function validateAttachmentsField(field: AttachmentsField): void {
  if (field.maxFiles !== undefined && !boundedInteger(field.maxFiles, 1, 5))
    fail(`field ${field.id} maxFiles must be 1-5`);
  if (field.maxFileSize !== undefined && !boundedInteger(field.maxFileSize, 1, 5 * 1024 * 1024))
    fail(`field ${field.id} maxFileSize is invalid`);
  if (
    field.accept !== undefined &&
    (!Array.isArray(field.accept) ||
      field.accept.length === 0 ||
      field.accept.length > 20 ||
      field.accept.some(
        value =>
          typeof value !== 'string' ||
          !value.trim() ||
          value.length > 120 ||
          !isAllowedFlowAttachmentType(value)
      ))
  )
    fail(`field ${field.id} accept is invalid`);
}

function normalizeAttachments(field: AttachmentsField, raw: unknown): FlowAttachment[] {
  if (!Array.isArray(raw) || raw.length > (field.maxFiles ?? 5))
    fail(`initial answer ${field.id} has too many attachments`);
  return raw.map(value => {
    if (!isObject(value)) fail(`initial answer ${field.id} has an invalid attachment`);
    assertOnlyKeys(value, new Set(['name', 'type', 'size', 'dataUrl']), 'attachment');
    requiredCopy(value.name, 'attachment name', 500);
    if (typeof value.type !== 'string' || !isAllowedFlowAttachmentType(value.type))
      fail('attachment type is invalid');
    if (!boundedInteger(value.size, 0, field.maxFileSize ?? 5 * 1024 * 1024))
      fail('attachment size is invalid');
    if (
      typeof value.dataUrl !== 'string' ||
      !new RegExp(`^data:${escapeRegex(value.type)};base64,[A-Za-z0-9+/]+={0,2}$`).test(
        value.dataUrl
      )
    )
      fail('attachment dataUrl is invalid');
    return { name: value.name, type: value.type, size: value.size, dataUrl: value.dataUrl };
  });
}
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requiredCopy(value: unknown, label: string, maximum: number): asserts value is string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum ||
    hasControlChars(value)
  )
    fail(`${label} is invalid`);
}
function optionalCopy(value: unknown, label: string, maximum: number): void {
  if (value !== undefined) requiredCopy(value, label, maximum);
}
function hasControlChars(value: string): boolean {
  return [...value].some(character => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
  });
}
function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}
function isScalar(value: unknown): value is FlowScalar {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function assertOnlyKeys(value: object, allowed: Set<string>, label: string): void {
  const unknown = Object.keys(value).find(key => !allowed.has(key));
  if (unknown) fail(`${label} contains unknown key ${unknown}`);
}
function fail(message: string): never {
  throw new TypeError(`BugDrop flow ${message}`);
}
