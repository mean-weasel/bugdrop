export type VariantClassification = 'bug' | 'feature' | 'question' | 'feedback';
export type VariantTheme = 'light' | 'dark' | 'auto';
export type VariantContextValue = string | number | boolean | null;
export type VariantContext = Record<string, VariantContextValue>;

export interface VariantContent {
  title: string;
  description?: string;
  submitLabel?: string;
  cancelLabel?: string;
  successTitle?: string;
  successMessage?: string;
}

interface BaseField {
  id: string;
  label: string;
  helpText?: string;
  required?: boolean;
  layout?: { span?: 1 | 2 };
}

export interface ShortTextField extends BaseField {
  type: 'shortText';
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
}

export interface LongTextField extends BaseField {
  type: 'longText';
  placeholder?: string;
  rows?: number;
  minLength?: number;
  maxLength?: number;
}

export interface RatingField extends BaseField {
  type: 'rating';
  scale?: 5 | 10;
  icon?: 'star' | 'number';
  lowLabel?: string;
  highLabel?: string;
}

export interface SingleChoiceField extends BaseField {
  type: 'singleChoice';
  options: Array<{ value: string; label: string; description?: string }>;
  display?: 'radio' | 'cards' | 'buttons';
}

export type VariantField = ShortTextField | LongTextField | RatingField | SingleChoiceField;

export type VariantIssueSection =
  | {
      heading: string;
      field: string;
      format?: 'text' | 'quote' | 'stars' | 'choice';
      omitWhenEmpty?: boolean;
    }
  | {
      heading: string;
      context: string;
      format?: 'text' | 'code';
      omitWhenEmpty?: boolean;
    };

export interface VariantConfig {
  id: string;
  configVersion?: 1;
  presentation:
    | { kind: 'modal'; size?: 'compact' | 'default' | 'wide'; columns?: 1 | 2 }
    | { kind: 'inline'; columns?: 1 | 2 };
  appearance?: {
    theme?: VariantTheme;
    accentColor?: string;
    density?: 'compact' | 'comfortable';
  };
  content: VariantContent;
  fields: VariantField[];
  issue: {
    classification?: VariantClassification;
    title: string;
    sections?: VariantIssueSection[];
  };
}

export interface VariantOpenOptions {
  context?: VariantContext;
  initialAnswers?: Record<string, unknown>;
}

export type VariantMountOptions = VariantOpenOptions;

export interface HeadlessSubmitOptions {
  context?: VariantContext;
  submissionId?: string;
}

export interface SubmissionResult {
  issueNumber: number;
  issueUrl: string;
  isPublic: boolean;
  labelMappingWarnings?: string[];
}

export type VariantOutcome =
  { status: 'submitted'; result: SubmissionResult } | { status: 'closed' } | { status: 'busy' };

export interface OpenedVariant {
  readonly instanceId: string;
  readonly result: Promise<VariantOutcome>;
  close(): void;
}

export interface MountedVariant {
  readonly instanceId: string;
  reset(): void;
  unmount(): void;
}

export interface VariantHandle {
  readonly id: string;
  open(options?: VariantOpenOptions): OpenedVariant;
  mount(target: HTMLElement, options?: VariantMountOptions): MountedVariant;
  submit(
    answers: Record<string, unknown>,
    options?: HeadlessSubmitOptions
  ): Promise<SubmissionResult>;
}

export interface BugDropPublicAPI {
  open(): void;
  close(): void;
  hide(): void;
  show(): void;
  isOpen(): boolean;
  isButtonVisible(): boolean;
  setTheme(mode: VariantTheme): void;
  registerVariant(config: VariantConfig): VariantHandle;
  registerFlow(
    config: import('../flows/public-types').FlowConfig
  ): import('../flows/public-types').FlowHandle;
}
