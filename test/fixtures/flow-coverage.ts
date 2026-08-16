import type { FlowRecipeId } from './flow-recipes';

export type ProofLevel = 'focused' | 'local-browser' | 'compatibility-control';
export type ArtifactIdentity = 'source' | 'local-widget' | 'candidate-and-classic';

export interface FlowCoverageRow {
  readonly primitiveOrState: string;
  readonly publicContract: string;
  readonly proofOwner: string;
  readonly proofLevel: ProofLevel;
  readonly recipe: FlowRecipeId | null;
  readonly artifactIdentity: ArtifactIdentity;
  readonly expectedAssertion: string;
  readonly gapStatus: 'covered' | 'deferred-product';
}

type Row = Omit<FlowCoverageRow, 'gapStatus'> & { gapStatus?: FlowCoverageRow['gapStatus'] };
const row = (value: Row): FlowCoverageRow => ({ gapStatus: 'covered', ...value });
const recipe = (
  primitiveOrState: string,
  publicContract: string,
  recipeId: FlowRecipeId,
  expectedAssertion: string
) =>
  row({
    primitiveOrState,
    publicContract,
    proofOwner: `e2e/public-flow.spec.ts#${recipeId} completes its natural composable journey`,
    proofLevel: 'local-browser',
    recipe: recipeId,
    artifactIdentity: 'local-widget',
    expectedAssertion,
  });
const focused = (
  primitiveOrState: string,
  publicContract: string,
  proofOwner: string,
  expectedAssertion: string
) =>
  row({
    primitiveOrState,
    publicContract,
    proofOwner,
    proofLevel: 'focused',
    recipe: null,
    artifactIdentity: 'source',
    expectedAssertion,
  });
const browser = (
  primitiveOrState: string,
  publicContract: string,
  proofOwner: string,
  expectedAssertion: string
) =>
  row({
    primitiveOrState,
    publicContract,
    proofOwner,
    proofLevel: 'local-browser',
    recipe: null,
    artifactIdentity: 'local-widget',
    expectedAssertion,
  });
const control = (
  primitiveOrState: string,
  publicContract: string,
  proofOwner: string,
  expectedAssertion: string
) =>
  row({
    primitiveOrState,
    publicContract,
    proofOwner,
    proofLevel: 'compatibility-control',
    recipe: null,
    artifactIdentity: 'candidate-and-classic',
    expectedAssertion,
  });

export const canonicalFlowCoverage: readonly FlowCoverageRow[] = Object.freeze([
  recipe(
    'field.shortText',
    'FlowField shortText',
    'bug-report',
    'summary and submitter text survive submission'
  ),
  focused(
    'field.helpText',
    'FlowField helpText',
    'test/flowFormScreen.test.ts#applies every inherited field control through the thin FlowForm adapter',
    'configured help copy renders and is referenced by the Flow control'
  ),
  focused(
    'field.shortText.placeholder',
    'ShortTextField placeholder',
    'test/flowFormScreen.test.ts#applies every inherited field control through the thin FlowForm adapter',
    'configured placeholder reaches the Flow input'
  ),
  focused(
    'field.shortText.minLength',
    'ShortTextField minLength',
    'test/flowFormScreen.test.ts#applies every inherited field control through the thin FlowForm adapter',
    'configured minimum length reaches the Flow input'
  ),
  focused(
    'field.shortText.maxLength',
    'ShortTextField maxLength',
    'test/flowFormScreen.test.ts#applies every inherited field control through the thin FlowForm adapter',
    'configured maximum length reaches the Flow input'
  ),
  recipe(
    'field.longText',
    'FlowField longText',
    'bug-report',
    'multiline steps compile as a quote'
  ),
  focused(
    'field.longText.placeholder',
    'LongTextField placeholder',
    'test/flowFormScreen.test.ts#applies every inherited field control through the thin FlowForm adapter',
    'configured placeholder reaches the Flow textarea'
  ),
  focused(
    'field.longText.rows',
    'LongTextField rows',
    'test/flowFormScreen.test.ts#applies every inherited field control through the thin FlowForm adapter',
    'configured row count reaches the Flow textarea'
  ),
  focused(
    'field.longText.minLength',
    'LongTextField minLength',
    'test/flowFormScreen.test.ts#applies every inherited field control through the thin FlowForm adapter',
    'configured minimum length reaches the Flow textarea'
  ),
  focused(
    'field.longText.maxLength',
    'LongTextField maxLength',
    'test/flowFormScreen.test.ts#applies every inherited field control through the thin FlowForm adapter',
    'configured maximum length reaches the Flow textarea'
  ),
  recipe(
    'field.rating.5.star',
    'rating scale 5 icon star',
    'product-triage',
    'five-star answer renders and compiles'
  ),
  recipe(
    'field.rating.10.number',
    'rating scale 10 icon number',
    'customer-pulse',
    'exactly ten numeric radio controls render and the selected answer compiles'
  ),
  recipe(
    'field.rating.lowLabel',
    'RatingField lowLabel',
    'customer-pulse',
    'configured Difficult endpoint label renders beside the ten-point scale'
  ),
  recipe(
    'field.rating.highLabel',
    'RatingField highLabel',
    'customer-pulse',
    'configured Easy endpoint label renders beside the ten-point scale'
  ),
  recipe(
    'field.singleChoice.radio',
    'singleChoice display radio',
    'product-triage',
    'radio choice retains its stable value'
  ),
  recipe(
    'field.singleChoice.cards',
    'singleChoice display cards',
    'product-triage',
    'card choice drives conditional routing'
  ),
  recipe(
    'field.singleChoice.buttons',
    'singleChoice display buttons',
    'customer-pulse',
    'button choice compiles its label'
  ),
  focused(
    'field.singleChoice.option.description',
    'SingleChoiceField option description',
    'test/flowFormScreen.test.ts#applies every inherited field control through the thin FlowForm adapter',
    'configured choice description renders inside the Flow choice control'
  ),
  recipe(
    'field.checkbox',
    'FlowField checkbox',
    'customer-pulse',
    'consent boolean reaches the draft'
  ),
  focused(
    'field.checkbox.initialValue',
    'CheckboxField initialValue',
    'test/flowFormScreen.test.ts#applies every inherited field control through the thin FlowForm adapter',
    'configured initial true state reaches the Flow checkbox and snapshot'
  ),
  recipe(
    'field.attachments',
    'FlowField attachments',
    'bug-report',
    'selected attachment reaches mocked feedback'
  ),
  focused(
    'field.shared-controller-adapter',
    'VariantField controllers reused by FlowForm',
    'test/flowRecipeConformance.test.ts#reuses shared field controllers through the thin flow adapter',
    'FlowForm renders and normalizes all inherited field types'
  ),
  focused(
    'field.adapter-instance-isolation',
    'thin FlowForm adapter instance isolation and disposal',
    'test/flowRecipeConformance.test.ts#namespaces simultaneous thin flow adapters and disposes them independently',
    'simultaneous adapters have disjoint ids and radio names, and disposing one leaves the other interactive'
  ),
  focused(
    'field.required-focus',
    'required field validation and focus',
    'test/flowFormScreen.test.ts#focuses the first invalid shared or extra field',
    'aria-invalid and active control identify the first failure'
  ),
  focused(
    'field.attachment-bounds',
    'attachment count, type, size, and read races',
    'test/flowFormScreen.test.ts#enforces selected attachment count, type, size, and latest-read race behavior',
    'over-count, unsupported-type, and oversized selections fail locally while only the latest read wins'
  ),
  recipe(
    'layout.field-span',
    'field layout span 1 or 2',
    'bug-report',
    'full-span fields and two-column evidence render naturally'
  ),
  recipe(
    'screen.message',
    'MessageScreen',
    'bug-report',
    'custom welcome copy and progress render'
  ),
  recipe('screen.form', 'FormScreen', 'product-triage', 'forms navigate forward and backward'),
  recipe(
    'screen.screenshot.optional',
    'ScreenshotScreen optional',
    'product-triage',
    'optional capture can be skipped'
  ),
  recipe(
    'screen.screenshot.required',
    'ScreenshotScreen required',
    'bug-report',
    'required capture has no skip and supplies PNG evidence'
  ),
  browser(
    'screen.screenshot.auto',
    'ScreenshotScreen auto',
    'e2e/public-flow.spec.ts#auto screenshot captures once without showing chooser or annotation',
    'automatic capture supplies PNG evidence without picker UI'
  ),
  focused(
    'screen.single-screenshot-bound',
    'at most one screenshot screen',
    'test/flowConfig.test.ts#two screenshots',
    'a second screenshot screen is rejected'
  ),
  recipe(
    'presentation.modal.compact',
    'modal size compact',
    'customer-pulse',
    'compact modal renders terminal pulse'
  ),
  recipe(
    'presentation.modal.default',
    'modal size default',
    'bug-report',
    'default modal renders report'
  ),
  recipe(
    'presentation.modal.wide',
    'modal size wide',
    'product-triage',
    'wide modal renders triage'
  ),
  recipe(
    'presentation.columns.1',
    'modal columns 1',
    'customer-pulse',
    'single-column pulse renders'
  ),
  browser(
    'presentation.columns.2',
    'modal columns 2',
    'e2e/public-flow.spec.ts#registerFlow two-column modal stays contained and collapses at narrow viewports',
    'configured columns render as two tracks at wide width and collapse to one track when narrow'
  ),
  recipe(
    'appearance.theme.light',
    'appearance theme light',
    'bug-report',
    'light theme tokens apply'
  ),
  recipe(
    'appearance.theme.dark',
    'appearance theme dark',
    'product-triage',
    'dark theme tokens apply'
  ),
  recipe(
    'appearance.theme.auto',
    'appearance theme auto',
    'customer-pulse',
    'automatic theme tokens apply'
  ),
  recipe(
    'appearance.accent',
    'appearance accentColor',
    'bug-report',
    'configured accent token applies'
  ),
  recipe(
    'appearance.density.compact',
    'appearance density compact',
    'product-triage',
    'compact density token applies'
  ),
  recipe(
    'appearance.density.comfortable',
    'appearance density comfortable',
    'customer-pulse',
    'comfortable density token applies'
  ),
  recipe(
    'content.action-copy',
    'screen continueLabel and backLabel',
    'customer-pulse',
    'Continue, Change score, and Send pulse labels drive their configured actions'
  ),
  recipe(
    'content.success-copy',
    'content successTitle and successMessage',
    'bug-report',
    'Report received and its configured thank-you message replace default success copy'
  ),
  recipe(
    'content.cancel-copy',
    'content cancelLabel',
    'bug-report',
    'retryable failure renders Discard report as the cancel action'
  ),
  browser(
    'presentation.responsive',
    'modal responsive behavior',
    'e2e/public-flow.spec.ts#registerFlow two-column modal stays contained and collapses at narrow viewports',
    'the narrow modal surface stays inside the viewport without horizontal overflow and uses one field column'
  ),
  browser(
    'presentation.reduced-motion',
    'prefers-reduced-motion Flow behavior',
    'e2e/public-flow.spec.ts#registerFlow reduced motion removes Flow surface and control motion',
    'under reduced-motion emulation the opened Flow surface, input, and action controls have no animation or transition duration and remain operable'
  ),
  browser(
    'presentation.radix',
    'shared modal ownership with Radix hosts',
    'e2e/public-flow.spec.ts#registerFlow remains interactive inside Radix-style host dismissal and focus traps',
    'registerFlow input keeps focus and host outside-interaction events are prevented from dismissing the host dialog'
  ),
  focused(
    'condition.answer',
    'answer equality predicate',
    'test/flowConditions.test.ts#evaluates answer, context, all, and any predicates',
    'only present exact scalar answers match'
  ),
  focused(
    'condition.context',
    'context equality predicate',
    'test/flowConditions.test.ts#evaluates answer, context, all, and any predicates',
    'immutable context drives visibility'
  ),
  focused(
    'condition.all',
    'all condition group',
    'test/flowConditions.test.ts#evaluates answer, context, all, and any predicates',
    'every child must match'
  ),
  focused(
    'condition.any',
    'any condition group',
    'test/flowConditions.test.ts#evaluates answer, context, all, and any predicates',
    'one matching child is sufficient'
  ),
  focused(
    'condition.bounds',
    'depth 4 and node count 32',
    'test/flowConditions.test.ts#bounds condition depth and size',
    'over-depth and over-size trees throw'
  ),
  focused(
    'condition.backward-only',
    'answer predicates reference earlier forms',
    'test/flowConfig.test.ts#forward condition',
    'forward answer reference throws'
  ),
  focused(
    'navigation.hidden-clearing',
    'newly hidden answer and capture clearing',
    'test/flowRuntime.test.ts#navigates visible screens, retains Back answers, and clears newly hidden answers/evidence',
    'pruned branches cannot leak stale state'
  ),
  focused(
    'navigation.back-retention',
    'Back snapshots visible answers',
    'test/flowRuntime.test.ts#does not clear still-visible form state during Back snapshots',
    'visible form answers remain intact'
  ),
  focused(
    'navigation.nearest-visible',
    'current route recovers when hidden',
    'test/flowRuntime.test.ts#recovers to the nearest visible screen after cascading branch changes',
    'current screen moves to nearest earlier visible route'
  ),
  focused(
    'navigation.progress',
    'position and total reflect visible routes',
    'test/flowRuntime.test.ts#uses visible routes and removes initially hidden answers before Issue compilation',
    'position and total omit hidden screens'
  ),
  focused(
    'navigation.async-suppression',
    'duplicate async navigation is ignored',
    'test/flowManager.test.ts#ignores a second form advance while async collection is in progress',
    'one action causes one transition'
  ),
  focused(
    'lifecycle.registration',
    'registration validation and duplicate rejection',
    'test/flowManager.test.ts#validates synchronously before DOM/network effects and rejects duplicates',
    'invalid configurations have no DOM effects and duplicate configured ids reject'
  ),
  focused(
    'lifecycle.public-identity',
    'FlowHandle.id and OpenedFlow.instanceId',
    'test/flowManager.test.ts#returns configured FlowHandle.id and generated OpenedFlow.instanceId',
    'the handle id equals the configured flow id and a normal open exposes its generated runtime instance id'
  ),
  focused(
    'lifecycle.initial-answers',
    'FlowOpenOptions.initialAnswers',
    'test/flowManager.test.ts#renders valid initial answers in the opened Flow UI and routed runtime',
    'valid namespaced choice, text, and checkbox answers seed the opened Flow and its conditional route'
  ),
  focused(
    'lifecycle.preflight-retry',
    'installation preflight retry',
    'test/flowManager.test.ts#retries installation preflight without closing the opened flow',
    'retry keeps the same opened flow'
  ),
  focused(
    'lifecycle.preflight-race',
    'stale preflight suppression',
    'test/flowManager.test.ts#ignores a stale preflight failure after a newer retry succeeds',
    'older completion cannot replace newer UI'
  ),
  focused(
    'lifecycle.busy-open',
    'public busy outcome while the legacy modal owns the surface',
    'test/flowManager.test.ts#returns busy while the legacy modal owns the surface',
    "the opened result is exactly {status:'busy'} and no Flow surface opens"
  ),
  focused(
    'lifecycle.busy',
    'one active submission or navigation action',
    'test/flowModal.test.ts#suppresses duplicate submit while busy and keeps named dialog ownership through success',
    'two submit clicks call the submission port once while the dialog is aria-busy'
  ),
  focused(
    'lifecycle.focus-trap-restore',
    'dialog focus containment and restoration',
    'test/flowModal.test.ts#contains Tab and Shift+Tab focus and restores the invoking control',
    'Tab wraps in both directions and closing restores the invoking control'
  ),
  focused(
    'lifecycle.validation-aria',
    'required errors use ARIA and live regions',
    'test/flowFormScreen.test.ts#focuses the first invalid shared or extra field',
    'invalid control exposes aria-invalid and live error copy'
  ),
  recipe(
    'lifecycle.submit-retry-success',
    'retryable submit then success result',
    'bug-report',
    'one retry resolves OpenedFlow.result to the exact submitted Issue result'
  ),
  browser(
    'lifecycle.close-teardown',
    'close aborts capture and disposes host',
    'e2e/public-flow.spec.ts#close tears down an in-progress screenshot chooser',
    'flow and chooser are both removed and result closes'
  ),
  focused(
    'output.title-interpolation',
    'Issue title namespaced interpolation',
    'test/flowIssueDraft.test.ts#maps namespaced answers and context without HTML execution',
    'trimmed answers interpolate literally'
  ),
  focused(
    'output.title-bound',
    'Issue title receiver bound',
    'test/flowIssueDraft.test.ts#bounds compiled Issue titles to the receiver contract',
    'compiled title is at most 256 characters'
  ),
  recipe(
    'output.classification.bug',
    'Issue classification bug',
    'bug-report',
    'mocked payload uses the configured bug classification'
  ),
  recipe(
    'output.classification.feature',
    'Issue classification feature',
    'product-triage',
    'mocked payload uses the configured feature classification'
  ),
  recipe(
    'output.classification.question',
    'Issue classification question',
    'customer-pulse',
    'mocked payload uses the configured question classification'
  ),
  focused(
    'output.format.text',
    'answer/context text format',
    'test/flowIssueDraft.test.ts#compiles every supported output format and omits only empty sections',
    'text values compile without decoration'
  ),
  focused(
    'output.format.quote',
    'answer quote format',
    'test/flowIssueDraft.test.ts#compiles every supported output format and omits only empty sections',
    'each line receives a quote marker'
  ),
  focused(
    'output.format.code',
    'answer/context inline code format',
    'test/flowIssueDraft.test.ts#keeps embedded backticks inside configured code spans',
    'delimiter grows around embedded backticks'
  ),
  focused(
    'output.format.stars',
    'rating stars format honors scale',
    'test/flowIssueDraft.test.ts#uses configured rating scales and choice labels and rejects empty compiled titles',
    'rating prints filled and empty glyphs plus fraction'
  ),
  focused(
    'output.format.choice',
    'singleChoice format uses label',
    'test/flowIssueDraft.test.ts#uses configured rating scales and choice labels and rejects empty compiled titles',
    'stable value maps to human label'
  ),
  focused(
    'output.omit-empty',
    'omitWhenEmpty',
    'test/flowIssueDraft.test.ts#compiles every supported output format and omits only empty sections',
    'undefined null and empty string sections disappear'
  ),
  recipe(
    'evidence.attachments',
    'mapped attachment payload',
    'bug-report',
    'attachment data URL reaches mocked feedback'
  ),
  recipe(
    'evidence.console-logs',
    'opt-in console log payload',
    'bug-report',
    'checked log consent supplies console logs'
  ),
  recipe(
    'evidence.submitter',
    'mapped submitter name and email',
    'bug-report',
    'trimmed submitter fields reach mocked feedback'
  ),
  focused(
    'evidence.screenshot-selectors',
    'screenshot and selector metadata',
    'test/flowSubmission.test.ts#carries mapped screenshot, attachments, logs, and submitter through the legacy recipe',
    'capture bytes and selectors reach mocked feedback'
  ),
  focused(
    'evidence.result-validation',
    'canonical Issue response validation',
    'test/flowSubmission.test.ts#rejects non-canonical legacy Issue results',
    'foreign or mismatched Issue URLs reject'
  ),
  control(
    'compatibility.classic-default',
    'classic/default lanes remain additive',
    'test/ci-workflow-contract.test.sh#Require identical candidate and classic legacy outcomes',
    'candidate and classic identifiers outcomes screenshots payload privacy and style controls remain present'
  ),
  row({
    primitiveOrState: 'unsupported.multi-select',
    publicContract: 'not present in FlowField union or scalar conditions',
    proofOwner:
      'test/flowCoverageMatrix.test.ts#records true multi-select as deferred product work',
    proofLevel: 'focused',
    recipe: null,
    artifactIdentity: 'source',
    expectedAssertion: 'no recipe or owner simulates choose-many behavior',
    gapStatus: 'deferred-product',
  }),
]);
