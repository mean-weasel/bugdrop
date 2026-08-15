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

  it('previews cumulative pointer ratings without changing the selected radio value', () => {
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

    buttons[3]?.dispatchEvent(new Event('pointerenter'));
    expect(buttons.map(button => button.classList.contains('bdv-rating-option--preview'))).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(rating.getValue()).toBe('');
    expect(buttons.map(button => button.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
      'false',
      'false',
    ]);

    buttons[3]?.click();
    expect(rating.getValue()).toBe(4);
    expect(buttons[3]?.getAttribute('aria-checked')).toBe('true');
    expect(buttons.map(button => button.classList.contains('bdv-rating-option--active'))).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(buttons.some(button => button.classList.contains('bdv-rating-option--preview'))).toBe(
      false
    );

    buttons[3]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(rating.getValue()).toBe(5);
    expect(buttons[4]?.getAttribute('aria-checked')).toBe('true');

    buttons[1]?.dispatchEvent(new Event('pointerenter'));
    expect(rating.getValue()).toBe(5);
    expect(buttons.map(button => button.classList.contains('bdv-rating-option--preview'))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(buttons.map(button => button.classList.contains('bdv-rating-option--active'))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(buttons.map(button => button.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
      'false',
      'true',
    ]);
    expect(buttons.map(button => button.tabIndex)).toEqual([-1, -1, -1, -1, 0]);
    buttons[2]?.dispatchEvent(new Event('pointerenter'));
    expect(buttons.map(button => button.classList.contains('bdv-rating-option--preview'))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    const group = rating.element.querySelector('.bdv-rating');
    group?.dispatchEvent(new Event('pointermove', { bubbles: true }));
    expect(buttons.some(button => button.classList.contains('bdv-rating-option--preview'))).toBe(
      false
    );
    expect(buttons.map(button => button.classList.contains('bdv-rating-option--active'))).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(rating.getValue()).toBe(5);
    expect(buttons[4]?.getAttribute('aria-checked')).toBe('true');

    rating.setDisabled(true);
    expect(buttons.every(button => button.disabled)).toBe(true);
    buttons[2]?.dispatchEvent(new Event('pointerenter'));
    expect(buttons.some(button => button.classList.contains('bdv-rating-option--preview'))).toBe(
      false
    );
    rating.setDisabled(false);
    buttons[2]?.dispatchEvent(new Event('pointerenter'));
    expect(buttons[2]?.classList.contains('bdv-rating-option--preview')).toBe(true);
    group?.dispatchEvent(new Event('pointerleave'));
    expect(buttons.some(button => button.classList.contains('bdv-rating-option--preview'))).toBe(
      false
    );
    rating.setValue('invalid');
    expect(rating.getValue()).toBe('');
    buttons[2]?.dispatchEvent(new Event('pointerenter'));
    rating.dispose();
    expect(buttons.some(button => button.classList.contains('bdv-rating-option--preview'))).toBe(
      false
    );
    buttons[2]?.dispatchEvent(new Event('pointerenter'));
    expect(buttons.some(button => button.classList.contains('bdv-rating-option--preview'))).toBe(
      false
    );
  });

  it.each(['radio', 'cards', 'buttons'] as const)(
    'renders %s choices with native radio semantics and stable values',
    display => {
      const choice = createFieldController(
        {
          id: 'provider',
          type: 'singleChoice',
          label: 'Provider',
          helpText: 'Choose one',
          required: true,
          display,
          options: [
            { value: 'stable-gcp', label: '<Google Cloud>', description: '<Fast & global>' },
            { value: 'stable-azure', label: 'Microsoft Azure' },
          ],
        },
        `instance-${display}`
      );
      document.body.appendChild(choice.element);
      const group = choice.element.querySelector<HTMLElement>('[role="radiogroup"]');
      const inputs = Array.from(choice.element.querySelectorAll<HTMLInputElement>('input'));

      expect(group?.classList.contains(display)).toBe(true);
      expect(inputs).toHaveLength(2);
      expect(inputs.every(input => input.type === 'radio')).toBe(true);
      const optionCopy = group?.querySelector('label');
      expect(optionCopy?.childNodes[1]?.textContent).toBe('<Google Cloud>');
      expect(optionCopy?.querySelector('.bdv-help')?.textContent).toBe('<Fast & global>');
      expect(choice.element.querySelector('img')).toBeNull();

      inputs[1]?.click();
      expect(choice.getValue()).toBe('stable-azure');
      choice.setValue('stable-gcp');
      expect(inputs[0]?.checked).toBe(true);
      choice.setValue('unknown');
      expect(choice.getValue()).toBe('');
      choice.setError('Choose an option');
      expect(group?.getAttribute('aria-invalid')).toBe('true');
      choice.focus();
      expect(document.activeElement).toBe(inputs[0]);
      choice.setDisabled(true);
      expect(inputs.every(input => input.disabled)).toBe(true);
      choice.dispose();
    }
  );
});
