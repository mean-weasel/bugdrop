import type {
  VariantConfig,
  VariantContext,
  VariantField,
  VariantIssueSection,
} from './public-types';

interface CompiledIssueDraft {
  title: string;
  classification?: 'bug' | 'feature' | 'question' | 'feedback';
  sections: Array<{ heading: string; value: string; format: 'text' | 'quote' | 'code' }>;
}

export function compileIssueDraft(
  config: Readonly<VariantConfig>,
  answers: Record<string, unknown>,
  context: VariantContext = {}
): CompiledIssueDraft {
  validateContext(context);
  const normalizedAnswers = normalizeAnswers(config.fields, answers);
  const title = config.issue.title
    .replace(/{{\s*([^{}]+?)\s*}}/g, (_match, reference: string) => {
      const value = reference.startsWith('context.')
        ? context[reference.slice('context.'.length)]
        : normalizedAnswers[reference];
      return displayValue(config.fields, reference, value, 'text');
    })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 256)
    .trim();
  if (!title) throw new TypeError('BugDrop variant produced an empty Issue title');

  const sections = (config.issue.sections ?? []).flatMap(section => {
    const value = resolveSectionValue(section, config.fields, normalizedAnswers, context);
    if (!value.trim() && section.omitWhenEmpty) return [];
    return [
      {
        heading: section.heading.trim(),
        value: value.trim() ? value : 'Not provided.',
        format: workerFormat(section),
      },
    ];
  });
  return {
    title,
    ...(config.issue.classification ? { classification: config.issue.classification } : {}),
    sections,
  };
}

function normalizeAnswers(
  fields: ReadonlyArray<VariantField>,
  answers: Record<string, unknown>
): Record<string, string | number> {
  if (!isObject(answers)) throw new TypeError('BugDrop variant answers must be an object');
  const knownFields = new Set(fields.map(field => field.id));
  const unknown = Object.keys(answers).find(key => !knownFields.has(key));
  if (unknown) throw new TypeError(`Unknown BugDrop variant answer: ${unknown}`);

  const normalized: Record<string, string | number> = {};
  for (const field of fields) {
    const raw = answers[field.id];
    if (field.type === 'shortText' || field.type === 'longText') {
      if (raw === undefined || raw === null || raw === '') {
        if (field.required) throw new TypeError(`Answer ${field.id} is required`);
        normalized[field.id] = '';
        continue;
      }
      if (typeof raw !== 'string') throw new TypeError(`Answer ${field.id} must be text`);
      const value = raw.trim();
      if (field.required && !value) throw new TypeError(`Answer ${field.id} is required`);
      const minimum = field.minLength ?? 0;
      const maximum = field.maxLength ?? (field.type === 'shortText' ? 500 : 5_000);
      if (value.length < minimum || value.length > maximum) {
        throw new TypeError(`Answer ${field.id} must be ${minimum}-${maximum} characters`);
      }
      normalized[field.id] = value;
    } else if (field.type === 'rating') {
      const scale = field.scale ?? 5;
      if (raw === undefined || raw === null || raw === '') {
        if (field.required) throw new TypeError(`Answer ${field.id} is required`);
        normalized[field.id] = '';
      } else if (!Number.isInteger(raw) || (raw as number) < 1 || (raw as number) > scale) {
        throw new TypeError(`Answer ${field.id} must be a rating from 1-${scale}`);
      } else {
        normalized[field.id] = raw as number;
      }
    } else {
      if (raw === undefined || raw === null || raw === '') {
        if (field.required) throw new TypeError(`Answer ${field.id} is required`);
        normalized[field.id] = '';
      } else if (typeof raw !== 'string' || !field.options.some(option => option.value === raw)) {
        throw new TypeError(`Answer ${field.id} must be a configured choice`);
      } else {
        normalized[field.id] = raw;
      }
    }
  }
  return normalized;
}

function resolveSectionValue(
  section: VariantIssueSection,
  fields: ReadonlyArray<VariantField>,
  answers: Record<string, string | number>,
  context: VariantContext
): string {
  if ('context' in section) return String(context[section.context] ?? '');
  return displayValue(fields, section.field, answers[section.field], section.format ?? 'text');
}

function displayValue(
  fields: ReadonlyArray<VariantField>,
  fieldId: string,
  value: unknown,
  format: string
): string {
  if (value === undefined || value === null || value === '') return '';
  const field = fields.find(candidate => candidate.id === fieldId);
  if (format === 'stars' && field?.type === 'rating' && typeof value === 'number') {
    const scale = field.scale ?? 5;
    return `${'★'.repeat(value)}${'☆'.repeat(scale - value)} (${value}/${scale})`;
  }
  if (format === 'choice' && field?.type === 'singleChoice') {
    return field.options.find(option => option.value === value)?.label ?? String(value);
  }
  return String(value);
}

function workerFormat(section: VariantIssueSection): 'text' | 'quote' | 'code' {
  return section.format === 'quote' || section.format === 'code' ? section.format : 'text';
}

function validateContext(context: VariantContext): void {
  if (!isObject(context) || Object.keys(context).length > 50) {
    throw new TypeError('BugDrop variant context must contain at most 50 values');
  }
  for (const [key, value] of Object.entries(context)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key)) throw new TypeError(`Invalid context key: ${key}`);
    if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) {
      throw new TypeError(`Invalid context value: ${key}`);
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError(`Invalid context value: ${key}`);
    }
    if (String(value ?? '').length > 5_000)
      throw new TypeError(`Context value is too long: ${key}`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
