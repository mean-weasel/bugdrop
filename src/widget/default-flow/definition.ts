import type { BugDropAuthTokenProvider } from '../auth-token';
import type { IssueLinkVisibility } from '../ui';

export const DEFAULT_DEFINITION_ID = 'bugdrop-default@1' as const;

type DefaultWelcomePolicy = 'once' | 'always' | 'never';
type DefaultScreenshotMode = 'optional' | 'auto' | 'required';
type DefaultCategory = 'bug' | 'feature' | 'question';
type DefaultCategoryLabels = Partial<Record<DefaultCategory, string | readonly string[]>>;

export interface DefaultDefinitionInput {
  repo: string;
  apiUrl: string;
  authTokenProvider?: BugDropAuthTokenProvider;
  welcome: DefaultWelcomePolicy;
  screenshotMode: DefaultScreenshotMode;
  skipWelcome: boolean;
  hasSeenWelcome: boolean;
  showName: boolean;
  requireName: boolean;
  showEmail: boolean;
  requireEmail: boolean;
  sendConsoleLogs: boolean;
  screenshotScale?: number;
  elementContextMaxArea?: number;
  accentColor?: string;
  categoryLabels?: DefaultCategoryLabels;
  issueLinkVisibility: IssueLinkVisibility;
}

export interface DefaultDefinition {
  readonly id: typeof DEFAULT_DEFINITION_ID;
  readonly steps: readonly [
    Readonly<{ kind: 'welcome'; enabled: boolean; remember: boolean }>,
    Readonly<{
      kind: 'details';
      repo: string;
      showName: boolean;
      requireName: boolean;
      showEmail: boolean;
      requireEmail: boolean;
      sendConsoleLogs: boolean;
    }>,
    Readonly<{
      kind: 'screenshot';
      mode: DefaultScreenshotMode;
      repo: string;
      screenshotScale?: number;
      elementContextMaxArea?: number;
      accentColor?: string;
    }>,
  ];
  readonly system: Readonly<{
    preflight: Readonly<{
      kind: 'installation';
      repo: string;
      apiUrl: string;
      authTokenProvider?: BugDropAuthTokenProvider;
    }>;
    submission: Readonly<{
      kind: 'legacy-feedback';
      repo: string;
      apiUrl: string;
      authTokenProvider?: BugDropAuthTokenProvider;
      categoryLabels?: Readonly<DefaultCategoryLabels>;
      issueLinkVisibility: IssueLinkVisibility;
    }>;
  }>;
}

export type DefaultWelcomeStep = DefaultDefinition['steps'][0];
export type DefaultDetailsStep = DefaultDefinition['steps'][1];
export type DefaultScreenshotStep = DefaultDefinition['steps'][2];
export type DefaultPreflightRecipe = DefaultDefinition['system']['preflight'];
export type DefaultSubmissionRecipe = DefaultDefinition['system']['submission'];

function freezeCategoryLabels(
  labels: DefaultCategoryLabels | undefined
): Readonly<DefaultCategoryLabels> | undefined {
  if (!labels) return undefined;
  return Object.freeze(
    Object.fromEntries(
      Object.entries(labels).map(([category, value]) => [
        category,
        Array.isArray(value) ? Object.freeze([...value]) : value,
      ])
    ) as DefaultCategoryLabels
  );
}

export function normalizeDefaultDefinition(input: DefaultDefinitionInput): DefaultDefinition {
  const welcomeEnabled =
    !input.skipWelcome &&
    input.welcome !== 'never' &&
    !(input.welcome === 'once' && input.hasSeenWelcome);

  const steps = Object.freeze([
    Object.freeze({
      kind: 'welcome' as const,
      enabled: welcomeEnabled,
      remember: welcomeEnabled && input.welcome === 'once',
    }),
    Object.freeze({
      kind: 'details' as const,
      repo: input.repo,
      showName: input.showName,
      requireName: input.requireName,
      showEmail: input.showEmail,
      requireEmail: input.requireEmail,
      sendConsoleLogs: input.sendConsoleLogs,
    }),
    Object.freeze({
      kind: 'screenshot' as const,
      mode: input.screenshotMode,
      repo: input.repo,
      screenshotScale: input.screenshotScale,
      elementContextMaxArea: input.elementContextMaxArea,
      accentColor: input.accentColor,
    }),
  ]) as DefaultDefinition['steps'];

  return Object.freeze({
    id: DEFAULT_DEFINITION_ID,
    steps,
    system: Object.freeze({
      preflight: Object.freeze({
        kind: 'installation' as const,
        repo: input.repo,
        apiUrl: input.apiUrl,
        authTokenProvider: input.authTokenProvider,
      }),
      submission: Object.freeze({
        kind: 'legacy-feedback' as const,
        repo: input.repo,
        apiUrl: input.apiUrl,
        authTokenProvider: input.authTokenProvider,
        categoryLabels: freezeCategoryLabels(input.categoryLabels),
        issueLinkVisibility: input.issueLinkVisibility,
      }),
    }),
  });
}
