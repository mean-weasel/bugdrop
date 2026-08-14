import type { VariantField } from './public-types';

type NormalizedVariantAnswer = string | number;

export class VariantAnswerError extends TypeError {
  constructor(
    public readonly fieldId: string | null,
    message: string
  ) {
    super(message);
    this.name = 'VariantAnswerError';
  }
}

export function assertKnownVariantAnswerKeys(
  fields: ReadonlyArray<VariantField>,
  answers: Record<string, unknown>
): void {
  if (!isObject(answers)) {
    throw new VariantAnswerError(null, 'BugDrop variant answers must be an object');
  }
  const knownFields = new Set(fields.map(field => field.id));
  const unknown = Object.keys(answers).find(key => !knownFields.has(key));
  if (unknown) {
    throw new VariantAnswerError(null, `Unknown BugDrop variant answer: ${unknown}`);
  }
}

export function normalizeVariantAnswers(
  fields: ReadonlyArray<VariantField>,
  answers: Record<string, unknown>
): Record<string, NormalizedVariantAnswer> {
  assertKnownVariantAnswerKeys(fields, answers);
  return Object.fromEntries(
    fields.map(field => [field.id, normalizeVariantAnswer(field, answers[field.id])])
  );
}

function normalizeVariantAnswer(field: VariantField, raw: unknown): NormalizedVariantAnswer {
  if (field.type === 'shortText' || field.type === 'longText') {
    if (raw === undefined || raw === null || raw === '') {
      if (field.required) throw fieldError(field, `Answer ${field.id} is required`);
      return '';
    }
    if (typeof raw !== 'string') {
      throw fieldError(field, `Answer ${field.id} must be text`);
    }
    const value = raw.trim();
    if (field.required && !value) throw fieldError(field, `Answer ${field.id} is required`);
    const minimum = field.minLength ?? 0;
    const maximum = field.maxLength ?? (field.type === 'shortText' ? 500 : 5_000);
    if (value.length < minimum || value.length > maximum) {
      throw fieldError(field, `Answer ${field.id} must be ${minimum}-${maximum} characters`);
    }
    return value;
  }

  if (field.type === 'rating') {
    const scale = field.scale ?? 5;
    if (raw === undefined || raw === null || raw === '') {
      if (field.required) throw fieldError(field, `Answer ${field.id} is required`);
      return '';
    }
    if (!Number.isInteger(raw) || (raw as number) < 1 || (raw as number) > scale) {
      throw fieldError(field, `Answer ${field.id} must be a rating from 1-${scale}`);
    }
    return raw as number;
  }

  if (raw === undefined || raw === null || raw === '') {
    if (field.required) throw fieldError(field, `Answer ${field.id} is required`);
    return '';
  }
  if (typeof raw !== 'string' || !field.options.some(option => option.value === raw)) {
    throw fieldError(field, `Answer ${field.id} must be a configured choice`);
  }
  return raw;
}

function fieldError(field: VariantField, message: string): VariantAnswerError {
  return new VariantAnswerError(field.id, message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
