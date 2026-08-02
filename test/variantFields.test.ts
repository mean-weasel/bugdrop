// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  VariantAnswerError,
  normalizeVariantAnswers,
} from '../src/widget/variants/answer-validation';
import { createFieldController } from '../src/widget/variants/fields';
import type { VariantField } from '../src/widget/variants/public-types';

describe('rendered variant field controllers', () => {
  it('normalizes rendered and headless answers through the same field errors', () => {
    const fields: VariantField[] = [
      { id: 'rating', type: 'rating', label: 'Rating', required: true, scale: 5 },
      { id: 'message', type: 'longText', label: 'Message', maxLength: 10 },
    ];

    expect(normalizeVariantAnswers(fields, { rating: 4, message: '  useful  ' })).toEqual({
      rating: 4,
      message: 'useful',
    });
    try {
      normalizeVariantAnswers(fields, { rating: '', message: '' });
      throw new Error('Expected required rating to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(VariantAnswerError);
      expect(error).toMatchObject({ fieldId: 'rating', message: 'Answer rating is required' });
    }
  });

  it('renders short and long text controls with bounded accessible state', () => {
    const short = createFieldController(
      {
        id: 'summary',
        type: 'shortText',
        label: 'Summary',
        helpText: 'Keep it brief',
        required: true,
        maxLength: 40,
      },
      'instance-1'
    );
    const long = createFieldController(
      { id: 'detail', type: 'longText', label: 'Detail', rows: 6, maxLength: 500 },
      'instance-1'
    );
    document.body.append(short.element, long.element);

    short.setValue('Cloudflare');
    long.setValue('More context');
    expect(short.getValue()).toBe('Cloudflare');
    expect(long.getValue()).toBe('More context');
    expect(short.element.querySelector('input')).toMatchObject({ required: true, maxLength: 40 });
    expect(long.element.querySelector('textarea')).toMatchObject({ rows: 6, maxLength: 500 });

    short.setError('Is required');
    expect(short.element.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
    expect(short.element.querySelector('.bdv-error')?.textContent).toBe('Is required');
    short.setError(null);
    expect(short.element.querySelector('input')?.hasAttribute('aria-invalid')).toBe(false);
  });

  it('supports pointer and keyboard rating selection without a form submit control', () => {
    const rating = createFieldController(
      {
        id: 'rating',
        type: 'rating',
        label: 'Rating',
        required: true,
        scale: 5,
        lowLabel: 'Poor',
        highLabel: 'Excellent',
      },
      'instance-2'
    );
    document.body.appendChild(rating.element);
    const buttons = Array.from(rating.element.querySelectorAll('button'));
    expect(buttons).toHaveLength(5);
    expect(buttons.every(button => button.type === 'button')).toBe(true);

    buttons[2]?.click();
    expect(rating.getValue()).toBe(3);
    buttons[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(rating.getValue()).toBe(4);
    expect(buttons[3]?.getAttribute('aria-checked')).toBe('true');

    rating.setDisabled(true);
    expect(buttons.every(button => button.disabled)).toBe(true);
    rating.setValue('invalid');
    expect(rating.getValue()).toBe('');
    rating.dispose();
  });
});
