import type { VariantField } from '../public-types';
import { createLongTextController } from './long-text';
import { createRatingController } from './rating';
import { createShortTextController } from './short-text';
import { createSingleChoiceController } from './single-choice';
import type { FieldController } from './types';

export function createFieldController(field: VariantField, instanceId: string): FieldController {
  if (field.type === 'shortText') return createShortTextController(field, instanceId);
  if (field.type === 'longText') return createLongTextController(field, instanceId);
  if (field.type === 'rating') return createRatingController(field, instanceId);
  return createSingleChoiceController(field, instanceId);
}
