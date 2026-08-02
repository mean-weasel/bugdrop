/* eslint-disable max-lines -- Keep complete synchronous public-config validation at one boundary. */
import type { VariantConfig, VariantField, VariantIssueSection } from './public-types';

const ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const PLACEHOLDER_PATTERN = /{{\s*([^{}]+?)\s*}}/g;
const CLASSIFICATIONS = new Set(['bug', 'feature', 'question', 'feedback']);
const FIELD_TYPES = new Set(['shortText', 'longText', 'rating', 'singleChoice']);
const TOP_LEVEL_KEYS = new Set([
  'id',
  'configVersion',
  'presentation',
  'appearance',
  'content',
  'fields',
  'issue',
]);
const CONTENT_KEYS = new Set([
  'title',
  'description',
  'submitLabel',
  'cancelLabel',
  'successTitle',
  'successMessage',
]);
const APPEARANCE_KEYS = new Set(['theme', 'accentColor', 'density']);
const ISSUE_KEYS = new Set(['classification', 'title', 'sections']);
const BASE_FIELD_KEYS = ['id', 'type', 'label', 'helpText', 'required', 'layout'];
const FIELD_KEYS: Record<VariantField['type'], Set<string>> = {
  shortText: new Set([...BASE_FIELD_KEYS, 'placeholder', 'minLength', 'maxLength']),
  longText: new Set([...BASE_FIELD_KEYS, 'placeholder', 'rows', 'minLength', 'maxLength']),
  rating: new Set([...BASE_FIELD_KEYS, 'scale', 'icon', 'lowLabel', 'highLabel']),
  singleChoice: new Set([...BASE_FIELD_KEYS, 'options', 'display']),
};

export function validateAndFreezeVariantConfig(input: VariantConfig): Readonly<VariantConfig> {
  if (!isObject(input)) throw new TypeError('BugDrop variant config must be an object');
  assertOnlyKeys(input, TOP_LEVEL_KEYS, 'variant config');
  if (typeof input.id !== 'string' || !ID_PATTERN.test(input.id) || input.id === 'legacy') {
    throw new TypeError('BugDrop variant id must match [a-z][a-z0-9_-]{0,63} and cannot be legacy');
  }
  if (input.configVersion !== undefined && input.configVersion !== 1) {
    throw new TypeError('BugDrop variant configVersion must be 1');
  }
  validatePresentation(input.presentation);
  validateAppearance(input.appearance);
  validateContent(input.content);
  if (!Array.isArray(input.fields) || input.fields.length === 0 || input.fields.length > 20) {
    throw new TypeError('BugDrop variant fields must contain 1-20 entries');
  }

  const fields = new Map<string, VariantField>();
  for (const field of input.fields) validateField(field, fields);
  validateIssue(input, fields);

  return deepFreeze(clone(input));
}

function validatePresentation(value: VariantConfig['presentation']): void {
  if (!isObject(value) || (value.kind !== 'modal' && value.kind !== 'inline')) {
    throw new TypeError('BugDrop variant presentation must be modal or inline');
  }
  assertOnlyKeys(
    value,
    value.kind === 'modal' ? new Set(['kind', 'size', 'columns']) : new Set(['kind', 'columns']),
    'variant presentation'
  );
  if (value.columns !== undefined && value.columns !== 1 && value.columns !== 2) {
    throw new TypeError('BugDrop variant presentation columns must be 1 or 2');
  }
  if (
    value.kind === 'modal' &&
    value.size !== undefined &&
    !['compact', 'default', 'wide'].includes(value.size)
  ) {
    throw new TypeError('BugDrop modal size must be compact, default, or wide');
  }
}

function validateAppearance(value: VariantConfig['appearance']): void {
  if (value === undefined) return;
  if (!isObject(value)) throw new TypeError('BugDrop variant appearance must be an object');
  assertOnlyKeys(value, APPEARANCE_KEYS, 'variant appearance');
  if (value.theme !== undefined && !['light', 'dark', 'auto'].includes(value.theme)) {
    throw new TypeError('BugDrop variant appearance theme is invalid');
  }
  if (
    value.accentColor !== undefined &&
    (!nonEmptyString(value.accentColor, 120) || hasControlChars(value.accentColor))
  ) {
    throw new TypeError('BugDrop variant appearance accentColor is invalid');
  }
  if (
    value.density !== undefined &&
    value.density !== 'compact' &&
    value.density !== 'comfortable'
  ) {
    throw new TypeError('BugDrop variant appearance density is invalid');
  }
}

function validateContent(value: VariantConfig['content']): void {
  if (!isObject(value)) throw new TypeError('BugDrop variant content must be an object');
  assertOnlyKeys(value, CONTENT_KEYS, 'variant content');
  if (!nonEmptyString(value.title, 500)) {
    throw new TypeError('BugDrop variant content.title is required');
  }
  validateOptionalCopy(value.description, 'description', 2_000);
  validateOptionalCopy(value.submitLabel, 'submitLabel', 120);
  validateOptionalCopy(value.cancelLabel, 'cancelLabel', 120);
  validateOptionalCopy(value.successTitle, 'successTitle', 500);
  validateOptionalCopy(value.successMessage, 'successMessage', 2_000);
}

function validateOptionalCopy(value: unknown, key: string, maximum: number): void {
  if (value !== undefined && !nonEmptyString(value, maximum)) {
    throw new TypeError(`BugDrop variant content.${key} is invalid`);
  }
}

function validateField(field: VariantField, fields: Map<string, VariantField>): void {
  if (
    !isObject(field) ||
    !FIELD_TYPES.has(field.type) ||
    typeof field.id !== 'string' ||
    !ID_PATTERN.test(field.id)
  ) {
    throw new TypeError('BugDrop variant field has an invalid type or id');
  }
  assertOnlyKeys(field, FIELD_KEYS[field.type], `field ${field.id}`);
  if (fields.has(field.id)) throw new TypeError(`Duplicate BugDrop variant field id: ${field.id}`);
  fields.set(field.id, field);
  if (!nonEmptyString(field.label, 500)) throw new TypeError(`Field ${field.id} requires a label`);
  if (field.helpText !== undefined && !nonEmptyString(field.helpText, 1_000)) {
    throw new TypeError(`Field ${field.id} has invalid helpText`);
  }
  if (field.required !== undefined && typeof field.required !== 'boolean') {
    throw new TypeError(`Field ${field.id} required must be boolean`);
  }
  validateLayout(field);

  if (field.type === 'shortText' || field.type === 'longText') {
    validateTextField(field);
  } else if (field.type === 'rating') {
    validateRatingField(field);
  } else {
    validateChoiceField(field);
  }
}

function validateLayout(field: VariantField): void {
  if (field.layout === undefined) return;
  if (!isObject(field.layout)) throw new TypeError(`Field ${field.id} layout must be an object`);
  assertOnlyKeys(field.layout, new Set(['span']), `field ${field.id} layout`);
  if (field.layout.span !== undefined && field.layout.span !== 1 && field.layout.span !== 2) {
    throw new TypeError(`Field ${field.id} layout span must be 1 or 2`);
  }
}

function validateTextField(field: Extract<VariantField, { type: 'shortText' | 'longText' }>): void {
  if (field.placeholder !== undefined && !nonEmptyString(field.placeholder, 500)) {
    throw new TypeError(`Field ${field.id} has invalid placeholder`);
  }
  const defaultMaximum = field.type === 'shortText' ? 500 : 5_000;
  if (
    (field.minLength !== undefined && !isBoundedInteger(field.minLength, 0, 5_000)) ||
    (field.maxLength !== undefined && !isBoundedInteger(field.maxLength, 1, 5_000))
  ) {
    throw new TypeError(`Field ${field.id} has invalid text bounds`);
  }
  const minimum = field.minLength === undefined ? 0 : field.minLength;
  const maximum = field.maxLength === undefined ? defaultMaximum : field.maxLength;
  if (
    !isBoundedInteger(minimum, 0, 5_000) ||
    !isBoundedInteger(maximum, 1, 5_000) ||
    minimum > maximum
  ) {
    throw new TypeError(`Field ${field.id} has invalid text bounds`);
  }
  if (
    field.type === 'longText' &&
    field.rows !== undefined &&
    !isBoundedInteger(field.rows, 1, 50)
  ) {
    throw new TypeError(`Field ${field.id} rows must be an integer from 1-50`);
  }
}

function validateRatingField(field: Extract<VariantField, { type: 'rating' }>): void {
  if (field.scale !== undefined && field.scale !== 5 && field.scale !== 10) {
    throw new TypeError(`Field ${field.id} rating scale must be 5 or 10`);
  }
  if (field.icon !== undefined && field.icon !== 'star' && field.icon !== 'number') {
    throw new TypeError(`Field ${field.id} rating icon must be star or number`);
  }
  if (field.lowLabel !== undefined && !nonEmptyString(field.lowLabel, 500)) {
    throw new TypeError(`Field ${field.id} has invalid lowLabel`);
  }
  if (field.highLabel !== undefined && !nonEmptyString(field.highLabel, 500)) {
    throw new TypeError(`Field ${field.id} has invalid highLabel`);
  }
}

function validateChoiceField(field: Extract<VariantField, { type: 'singleChoice' }>): void {
  if (!Array.isArray(field.options) || field.options.length < 2 || field.options.length > 50) {
    throw new TypeError(`Field ${field.id} requires 2-50 choices`);
  }
  if (
    field.display !== undefined &&
    field.display !== 'radio' &&
    field.display !== 'cards' &&
    field.display !== 'buttons'
  ) {
    throw new TypeError(`Field ${field.id} choice display is invalid`);
  }
  const values = new Set<string>();
  for (const option of field.options) {
    if (!isObject(option)) throw new TypeError(`Field ${field.id} has an invalid choice`);
    assertOnlyKeys(option, new Set(['value', 'label', 'description']), `field ${field.id} choice`);
    if (!nonEmptyString(option.value, 120) || !nonEmptyString(option.label, 500)) {
      throw new TypeError(`Field ${field.id} has an invalid choice`);
    }
    if (option.description !== undefined && !nonEmptyString(option.description, 1_000)) {
      throw new TypeError(`Field ${field.id} has an invalid choice description`);
    }
    if (values.has(option.value)) throw new TypeError(`Field ${field.id} has duplicate choices`);
    values.add(option.value);
  }
}

function validateIssue(config: VariantConfig, fields: Map<string, VariantField>): void {
  if (!isObject(config.issue)) throw new TypeError('BugDrop variant issue must be an object');
  assertOnlyKeys(config.issue, ISSUE_KEYS, 'variant issue');
  if (!nonEmptyString(config.issue.title, 2_000)) {
    throw new TypeError('BugDrop variant issue.title is required');
  }
  if (
    config.issue.classification !== undefined &&
    !CLASSIFICATIONS.has(config.issue.classification)
  ) {
    throw new TypeError('BugDrop variant issue.classification is invalid');
  }
  for (const token of config.issue.title.matchAll(PLACEHOLDER_PATTERN)) {
    const reference = token[1];
    if (reference.startsWith('context.')) {
      if (!ID_PATTERN.test(reference.slice('context.'.length))) throw invalidTemplate();
    } else if (!fields.has(reference)) {
      throw new TypeError(`Unknown BugDrop variant title field: ${reference}`);
    }
  }
  if (config.issue.title.replace(PLACEHOLDER_PATTERN, '').includes('{{')) throw invalidTemplate();

  if (config.issue.sections !== undefined && !Array.isArray(config.issue.sections)) {
    throw new TypeError('BugDrop variant Issue accepts at most 20 sections');
  }
  const sections = config.issue.sections ?? [];
  if (sections.length > 20)
    throw new TypeError('BugDrop variant Issue accepts at most 20 sections');
  const headings = new Set<string>();
  for (const section of sections) validateSection(section, fields, headings);
}

function validateSection(
  section: VariantIssueSection,
  fields: Map<string, VariantField>,
  headings: Set<string>
): void {
  if (!isObject(section) || !nonEmptyString(section.heading, 120)) {
    throw new TypeError('BugDrop variant Issue section requires a heading');
  }
  const isFieldSection = 'field' in section;
  const isContextSection = 'context' in section;
  if (isFieldSection === isContextSection) {
    throw new TypeError('BugDrop variant Issue section must reference one field or context key');
  }
  assertOnlyKeys(
    section,
    isFieldSection
      ? new Set(['heading', 'field', 'format', 'omitWhenEmpty'])
      : new Set(['heading', 'context', 'format', 'omitWhenEmpty']),
    'variant Issue section'
  );
  if (section.omitWhenEmpty !== undefined && typeof section.omitWhenEmpty !== 'boolean') {
    throw new TypeError('BugDrop variant Issue section omitWhenEmpty must be boolean');
  }
  const heading = section.heading.trim().toLowerCase();
  if (headings.has(heading))
    throw new TypeError(`Duplicate BugDrop Issue heading: ${section.heading}`);
  headings.add(heading);

  if (isFieldSection) {
    const field = fields.get(section.field);
    if (!field) throw new TypeError(`Unknown Issue field: ${section.field}`);
    const format = section.format === undefined ? 'text' : section.format;
    if (!['text', 'quote', 'stars', 'choice'].includes(format)) {
      throw new TypeError(`Invalid Issue field format: ${String(format)}`);
    }
    if (format === 'stars' && field.type !== 'rating') {
      throw new TypeError('BugDrop stars format requires a rating field');
    }
    if (format === 'choice' && field.type !== 'singleChoice') {
      throw new TypeError('BugDrop choice format requires a singleChoice field');
    }
  } else {
    if (typeof section.context !== 'string' || !ID_PATTERN.test(section.context)) {
      throw new TypeError(`Invalid Issue context key: ${section.context}`);
    }
    if (section.format !== undefined && section.format !== 'text' && section.format !== 'code') {
      throw new TypeError(`Invalid Issue context format: ${String(section.format)}`);
    }
  }
}

function invalidTemplate(): TypeError {
  return new TypeError('BugDrop variant title contains an invalid placeholder');
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  const unknown = Object.keys(value).find(key => !allowed.has(key));
  if (unknown) throw new TypeError(`Unknown BugDrop ${label} property: ${unknown}`);
}

function nonEmptyString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function hasControlChars(value: string): boolean {
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => clone(item)) as T;
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  }
  return value;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
