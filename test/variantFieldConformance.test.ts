// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeVariantAnswers } from '../src/widget/variants/answer-validation';
import { createFieldController } from '../src/widget/variants/fields';
import type { VariantField } from '../src/widget/variants/public-types';

interface ConformanceFixture {
  name: string;
  field: VariantField;
  value: string | number;
  normalized: string | number;
  controlSelector: string;
  accessibilitySelector: string;
}

const fixtures: ConformanceFixture[] = [
  {
    name: 'short text',
    field: {
      id: 'summary',
      type: 'shortText',
      label: 'Summary',
      helpText: 'Keep it brief',
      required: true,
      maxLength: 120,
    },
    value: '  A compact idea  ',
    normalized: 'A compact idea',
    controlSelector: 'input',
    accessibilitySelector: 'input',
  },
  {
    name: 'long text',
    field: {
      id: 'detail',
      type: 'longText',
      label: 'Detail',
      helpText: 'Add context',
      required: true,
      maxLength: 2_000,
    },
    value: '  More contributor context  ',
    normalized: 'More contributor context',
    controlSelector: 'textarea',
    accessibilitySelector: 'textarea',
  },
  {
    name: 'rating',
    field: {
      id: 'rating',
      type: 'rating',
      label: 'Rating',
      helpText: 'Choose a score',
      required: true,
      scale: 5,
    },
    value: 4,
    normalized: 4,
    controlSelector: '[role="radio"][aria-label="4 stars"]',
    accessibilitySelector: '[role="radiogroup"]',
  },
  {
    name: 'single choice',
    field: {
      id: 'choice',
      type: 'singleChoice',
      label: 'Choice',
      helpText: 'Choose one',
      required: true,
      options: [
        { value: 'one', label: 'One' },
        { value: 'two', label: 'Two' },
      ],
    },
    value: 'two',
    normalized: 'two',
    controlSelector: 'input[value="two"]',
    accessibilitySelector: '[role="radiogroup"]',
  },
];

describe('built-in field-controller conformance', () => {
  beforeEach(() => document.body.replaceChildren());

  it.each(fixtures)(
    '$name satisfies the shared render, value, validation, focus, disabled, reset, and disposal contract',
    ({ field, value, normalized, controlSelector, accessibilitySelector }) => {
      const controller = createFieldController(field, `conformance-${field.id}`);
      document.body.appendChild(controller.element);
      const control = controller.element.querySelector<HTMLElement>(controlSelector);
      const accessibilityTarget =
        controller.element.querySelector<HTMLElement>(accessibilitySelector);
      const error = controller.element.querySelector<HTMLElement>('.bdv-error');

      expect(controller.field).toBe(field);
      expect(controller.element.dataset.bugdropField).toBe(field.id);
      expect(controller.element.textContent).toContain(field.label);
      expect(control).not.toBeNull();
      expect(accessibilityTarget?.getAttribute('aria-describedby')).toContain(`${field.id}-help`);

      controller.setValue(value);
      expect(controller.getValue()).toBe(value);
      expect(normalizeVariantAnswers([field], { [field.id]: controller.getValue() })).toEqual({
        [field.id]: normalized,
      });

      controller.setError('Conformance error');
      expect(error).toMatchObject({ hidden: false, textContent: 'Conformance error' });
      expect(
        accessibilityTarget?.getAttribute('aria-invalid') === 'true'
          ? accessibilityTarget.getAttribute('aria-describedby')
          : null
      ).toContain(`${field.id}-error`);
      controller.setError(null);
      expect(error).toMatchObject({ hidden: true, textContent: '' });

      controller.setDisabled(true);
      expect(
        Array.from(
          controller.element.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
            'input, textarea, button'
          )
        ).every(element => element.disabled)
      ).toBe(true);
      controller.setDisabled(false);
      controller.focus();
      expect(controller.element.contains(document.activeElement)).toBe(true);

      controller.setValue('');
      expect(controller.getValue()).toBe('');
      controller.dispose();
      controller.dispose();
      expect(controller.element.isConnected).toBe(true);
    }
  );

  it('keeps generated controller identities isolated across simultaneous instances', () => {
    const field = fixtures[3]!.field;
    const first = createFieldController(field, 'first-instance');
    const second = createFieldController(field, 'second-instance');
    document.body.append(first.element, second.element);

    const firstNames = Array.from(first.element.querySelectorAll<HTMLInputElement>('input')).map(
      input => input.name
    );
    const secondNames = Array.from(second.element.querySelectorAll<HTMLInputElement>('input')).map(
      input => input.name
    );
    expect(new Set(firstNames)).toEqual(new Set(['first-instance-choice']));
    expect(new Set(secondNames)).toEqual(new Set(['second-instance-choice']));
    expect(firstNames[0]).not.toBe(secondNames[0]);
  });
});
