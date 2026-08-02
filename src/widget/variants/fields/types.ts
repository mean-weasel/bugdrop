import type { VariantField } from '../public-types';

export interface FieldController {
  readonly field: VariantField;
  readonly element: HTMLElement;
  getValue(): unknown;
  setValue(value: unknown): void;
  setError(message: string | null): void;
  setDisabled(disabled: boolean): void;
  focus(): void;
  dispose(): void;
}

export interface FieldScaffold {
  readonly wrapper: HTMLDivElement;
  readonly label: HTMLLabelElement;
  readonly controlId: string;
  readonly labelId: string;
  readonly describedBy: string | null;
  setError(target: HTMLElement, message: string | null): void;
}
