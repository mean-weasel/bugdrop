import type {
  DefaultDefinition,
  DefaultDetailsStep,
  DefaultPreflightRecipe,
  DefaultScreenshotStep,
  DefaultSubmissionRecipe,
  DefaultWelcomeStep,
} from './definition';

type DefaultPreflightResult =
  { status: 'installed' } | { status: 'not_installed' | 'unreachable'; appName?: string };

export interface DefaultJourneyPorts<Details, Capture> {
  preflight: (recipe: DefaultPreflightRecipe) => Promise<DefaultPreflightResult>;
  showPreflightFailure: (result: Exclude<DefaultPreflightResult, { status: 'installed' }>) => void;
  showWelcome: (step: DefaultWelcomeStep) => Promise<boolean>;
  rememberWelcome: (step: DefaultWelcomeStep) => void;
  showDetails: (step: DefaultDetailsStep, previous: Details | null) => Promise<Details | null>;
  capture: (
    step: DefaultScreenshotStep,
    details: Details
  ) => Promise<Capture & { returnToDetails: boolean }>;
  submit: (recipe: DefaultSubmissionRecipe, details: Details, capture: Capture) => Promise<void>;
}

export async function runDefaultJourney<Details, Capture>(
  definition: DefaultDefinition,
  ports: DefaultJourneyPorts<Details, Capture>
): Promise<'finished' | 'preflight-blocked'> {
  const preflight = await ports.preflight(definition.system.preflight);
  if (preflight.status !== 'installed') {
    ports.showPreflightFailure(preflight);
    return 'preflight-blocked';
  }

  const welcome = definition.steps[0];
  if (welcome.enabled) {
    if (!(await ports.showWelcome(welcome))) return 'finished';
    if (welcome.remember) ports.rememberWelcome(welcome);
  }

  const detailsStep = definition.steps[1];
  const screenshotStep = definition.steps[2];
  let details: Details | null = null;
  while (true) {
    details = await ports.showDetails(detailsStep, details);
    if (!details) return 'finished';

    const capture = await ports.capture(screenshotStep, details);
    if (capture.returnToDetails) continue;

    await ports.submit(definition.system.submission, details, capture);
    return 'finished';
  }
}
