export type {
  BugDropPublicAPI,
  HeadlessSubmitOptions,
  LongTextField,
  MountedVariant,
  OpenedVariant,
  RatingField,
  ShortTextField,
  SingleChoiceField,
  SubmissionResult,
  VariantClassification,
  VariantConfig,
  VariantContext,
  VariantContextValue,
  VariantContent,
  VariantField,
  VariantHandle,
  VariantIssueSection,
  VariantMountOptions,
  VariantOpenOptions,
  VariantOutcome,
  VariantTheme,
} from './variants/public-types';

import type { BugDropPublicAPI } from './variants/public-types';

declare global {
  interface Window {
    BugDrop?: BugDropPublicAPI;
  }
}
