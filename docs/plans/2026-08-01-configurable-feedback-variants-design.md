# Configurable Feedback Variants

**Status:** Proposed

**Date:** 2026-08-01

**Scope:** Additive extension to the BugDrop v1 widget and Worker contracts

## Summary

Extend BugDrop from one fixed feedback wizard into a small, declarative feedback runtime that
can render multiple independently configured UX variants on the same page. Every successful
submission still creates a GitHub Issue through BugDrop's existing Worker and GitHub App.

The current widget remains the default and is not redesigned by this work. Existing script tags,
data attributes, `window.BugDrop` methods, request payloads, GitHub Issue formatting, and screenshot
flows must continue to behave as they do today when no variant API is used.

The initial variant examples are:

1. A one-to-five-star review with an optional message and explicit Submit button.
2. A CTA-driven question that opens a simple text-response form.
3. A single-choice poll with an optional explanation.
4. A compact suggestion form with a short summary and optional detail.

These are proving fixtures, not the architectural limit. Contributors should be able to compose
new variants from shared primitives or use the headless submission API for fully custom UI.

## Problem

BugDrop currently owns one hard-coded flow:

1. Optional welcome screen.
2. Bug, feature, or question category selection.
3. Required title and optional description.
4. Optional submitter information and evidence.
5. Optional screenshot capture and annotation.
6. GitHub Issue creation.

This flow is valuable and must remain stable, but it is too opinionated for contextual prompts such
as post-action reviews, embedded polls, or a targeted "Which provider should we add?" CTA. Host
applications can build those experiences themselves, but they must then duplicate BugDrop's auth,
metadata, validation, error handling, and GitHub submission behavior.

Loading multiple copies of the current widget is not a safe workaround. The bundle discovers one
script element, creates one `#bugdrop-host`, stores state in module globals, and assigns one
`window.BugDrop` object.

## Goals

- Preserve the complete legacy widget contract by default.
- Load the BugDrop bundle once and support multiple logical variant instances.
- Provide declarative modal and inline layouts.
- Provide a small initial field catalog that can grow without rewriting submission logic.
- Keep one explicit Submit action per response.
- Create one GitHub Issue for every submission that BugDrop reports as successful.
- Support configurable user-facing labels, help text, validation, success copy, and safe Issue
  templates.
- Keep GitHub label authority on the Worker, not in untrusted browser requests.
- Provide a headless API for host-rendered experiences.
- Make new built-in field types and presentations straightforward for contributors to add and test.
- Require no new database, queue, storage product, or backend service.

## Non-goals

- Replacing or visually redesigning the existing BugDrop wizard.
- A hosted visual form builder or remote configuration service.
- Response aggregation, dashboards, surveys, or analytics storage.
- Conditional branching or multi-page form logic in the first release.
- A public runtime plugin API that executes third-party renderer code inside BugDrop's Shadow DOM.
- A strict exactly-once delivery guarantee during GitHub or network outages.
- Supporting multiple copies of `widget.js` on one page.

## Terminology

- **Legacy widget:** The current BugDrop trigger, wizard, evidence flow, and payload.
- **Variant:** A named declarative form definition.
- **Variant handle:** The object returned when a variant is registered.
- **Instance:** One mounted inline form or one opened modal created from a variant.
- **Presentation:** The container and interaction model, initially `modal` or `inline`.
- **Field renderer:** The code that renders, reads, validates, and serializes one field type.
- **Headless submission:** A host-rendered UI calling BugDrop only for validation, metadata, auth,
  and submission.
- **Issue template:** Declarative rules for turning normalized answers into a title and ordered
  Markdown sections. GitHub labels are configured separately.

## Design Principles

### One runtime, many instances

The page loads one BugDrop script. That runtime owns shared configuration, auth, metadata capture,
and transport. Each variant registration and mount has isolated form state.

Multiple script tags are explicitly unsupported. Multiple logical instances are supported.

### Composition over named special cases

`rating-review` is not a permanent hard-coded rendering branch. It is a variant composed from a
`rating` field, a `longText` field, an inline or modal presentation, and an Issue template.

### Rendering is separate from submission

Standard BugDrop renderers and host-rendered forms must produce the same normalized submission.
The Worker must not care whether BugDrop or React rendered the controls.

### The browser controls UX, the Worker controls GitHub policy

Browser configuration may control copy, field order, validation, and Issue title/body composition.
It may not apply arbitrary GitHub labels. The Worker resolves labels from server configuration and
always adds the `bugdrop` label.

### Compatibility is an executable contract

Legacy behavior is protected by tests, not only documentation or convention.

## Backwards-Compatibility Contract

The following behavior is normative:

1. A page using only the existing script tag receives the existing widget.
2. All existing `data-*` attributes retain their current defaults and meanings.
3. `window.BugDrop.open()` with no arguments opens the current form and skips the welcome screen,
   as it does today.
4. `close()`, `hide()`, `show()`, `isOpen()`, `isButtonVisible()`, and `setTheme()` retain their
   current behavior and signatures.
5. The existing `bugdrop:ready` event still fires once after legacy initialization.
6. The existing `#bugdrop-host` remains the legacy host and is not renamed.
7. Existing `FeedbackPayload` requests remain valid and retain their current Issue body and label
   behavior.
8. Existing localStorage keys and screenshot behavior are unchanged for the legacy flow.
9. Variant-only CSS, DOM, storage keys, events, and payload fields are namespaced and cannot alter
   legacy output unless a variant API is called.
10. Existing `widget.v1.js` consumers receive only additive behavior. Any unavoidable incompatible
    change requires `widget.v2.js`; it must not be smuggled into the v1 bundle.

The reserved variant ID `legacy` refers to the existing form but cannot be overridden by a caller.

## Public Browser API

The existing object gains additive methods:

```ts
interface BugDropAPI {
  // Existing API, unchanged
  open(): void;
  close(): void;
  hide(): void;
  show(): void;
  isOpen(): boolean;
  isButtonVisible(): boolean;
  setTheme(mode: 'light' | 'dark' | 'auto'): void;

  // Additive variant API
  registerVariant(config: VariantConfig): VariantHandle;
  getVariant(id: string): VariantHandle | undefined;
  unregisterVariant(id: string): void;
}

interface VariantHandle {
  readonly id: string;
  open(options?: VariantOpenOptions): Promise<VariantOutcome>;
  mount(target: HTMLElement, options?: VariantMountOptions): MountedVariant;
  submit(
    answers: Record<string, unknown>,
    options?: HeadlessSubmitOptions
  ): Promise<SubmissionResult>;
}

interface MountedVariant {
  readonly instanceId: string;
  reset(): void;
  unmount(): void;
}

interface VariantOpenOptions {
  context?: Record<string, string | number | boolean | null>;
  initialAnswers?: Record<string, unknown>;
}

type VariantMountOptions = VariantOpenOptions;

interface HeadlessSubmitOptions {
  context?: Record<string, string | number | boolean | null>;
  submissionId?: string;
}

type VariantOutcome =
  | { status: 'submitted'; result: SubmissionResult }
  | { status: 'closed' };

interface SubmissionResult {
  issueNumber: number;
  issueUrl: string;
  isPublic: boolean;
  warnings?: string[];
}
```

`open()` remains overloaded only at runtime: zero arguments always selects the legacy behavior.
Variant consumers should prefer the returned handle rather than `BugDrop.open(id)`, which keeps the
legacy method's public TypeScript signature unambiguous.

Registration validates the entire config synchronously. Duplicate IDs, reserved IDs, unknown field
types, invalid templates, or duplicate field IDs throw a descriptive configuration error. BugDrop
must not partially register an invalid variant. A successful registration stores a normalized deep
copy; later mutation of the caller's object cannot alter an active form or its submission payload.

`unregisterVariant()` is allowed only after all of that variant's mounted instances are unmounted
and no modal instance is active. Otherwise it throws a lifecycle error. This makes cleanup explicit
and prevents unregistering configuration that an in-flight submission still needs.

## Variant Configuration

```ts
interface VariantConfig {
  id: string;
  configVersion?: 1;
  presentation: VariantPresentation;
  content: {
    title: string;
    description?: string;
    submitLabel?: string;
    cancelLabel?: string;
    successTitle?: string;
    successMessage?: string;
  };
  fields: VariantField[];
  issue: VariantIssueTemplate;
  evidence?: VariantEvidenceConfig;
}

type VariantPresentation =
  | {
      kind: 'modal';
      size?: 'compact' | 'default' | 'wide';
      columns?: 1 | 2;
    }
  | {
      kind: 'inline';
      columns?: 1 | 2;
    };

interface VariantEvidenceConfig {
  screenshot?: 'off' | 'optional' | 'required';
  attachments?: 'off' | 'optional';
  consoleLogs?: 'off' | 'optional' | 'default-on';
}
```

Defaults are conservative: evidence is off for new variants unless explicitly enabled. This avoids
surprising screenshot capture in lightweight ratings and polls.

Caller-provided content is literal display copy. BugDrop's built-in validation, loading, retry,
accessibility, and fallback strings continue to come from the active locale dictionary.

### Initial field catalog

```ts
type VariantField =
  | ShortTextField
  | LongTextField
  | RatingField
  | SingleChoiceField;

interface BaseField {
  id: string;
  label: string;
  helpText?: string;
  required?: boolean;
  layout?: { span?: 1 | 2 };
}

interface ShortTextField extends BaseField {
  type: 'shortText';
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
}

interface LongTextField extends BaseField {
  type: 'longText';
  placeholder?: string;
  rows?: number;
  minLength?: number;
  maxLength?: number;
}

interface RatingField extends BaseField {
  type: 'rating';
  min?: 1;
  max?: 5 | 10;
  icon?: 'star' | 'number';
  lowLabel?: string;
  highLabel?: string;
}

interface SingleChoiceField extends BaseField {
  type: 'singleChoice';
  options: Array<{ value: string; label: string; description?: string }>;
  display?: 'radio' | 'cards' | 'buttons';
}
```

Field IDs must match `[a-z][a-z0-9_-]{0,63}`. Answer values are keyed by field ID. Hidden
application state is passed as bounded `context`, not represented by a hidden form field.

The initial catalog is intentionally small. Checkboxes, multi-select, date, file, NPS, emoji scale,
and conditional fields can be added later as new discriminated-union members without changing the
submission or Worker contracts.

## Issue Templates

Issue templates are declarative rather than arbitrary executable callbacks:

```ts
interface VariantIssueTemplate {
  classification?: 'bug' | 'feature' | 'question' | 'feedback';
  labelSet?: string;
  title: string;
  sections?: Array<
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
      }
  >;
}
```

Title templates support only escaped field and context placeholders:

```text
[Export review] {{rating}}/5 — {{context.surface}}
Cloud provider request — {{provider}}
```

There are no expressions, loops, conditionals, or function calls. Missing placeholders resolve to
an empty string, whitespace is collapsed, and the result is length-bounded before the GitHub call.

If `sections` is omitted, the Worker renders all answers in field order using their configured
labels. The Worker always appends BugDrop's attribution and safe system information; a client
template cannot remove those sections.

The browser may influence Issue title and body because the legacy payload already permits arbitrary
user title and description. It may request only a logical `labelSet`. The Worker resolves that key
through optional server configuration such as:

```json
{
  "owner/repo": {
    "product-review": ["feedback", "rating"],
    "cloud-provider": ["enhancement", "cloud-import"]
  }
}
```

The suggested Worker variable name is `VARIANT_LABELS`. It follows the existing per-repository
`CATEGORY_LABELS` precedence model and does not introduce a configuration service.

Unknown or invalid label sets fall back to classification defaults plus `bugdrop`, with an operator
warning. Client-provided raw GitHub label arrays are rejected.

Classification defaults are:

| Classification | Labels |
| --- | --- |
| `bug` | `bug`, `bugdrop` |
| `feature` | `enhancement`, `bugdrop` |
| `question` | `question`, `bugdrop` |
| `feedback` or omitted | `bugdrop` |

## Initial Acceptance Variants

These are documentation examples and automated fixtures. They may be exported as optional helper
factories, but the runtime must treat them as ordinary configurations.

### 1. One-to-five-star review

```ts
const review = BugDrop.registerVariant({
  id: 'export-review',
  presentation: { kind: 'inline' },
  content: {
    title: 'How was this export?',
    submitLabel: 'Submit review',
    successTitle: 'Thanks for the review!',
  },
  fields: [
    {
      id: 'rating',
      type: 'rating',
      label: 'Rating',
      required: true,
      min: 1,
      max: 5,
      icon: 'star',
    },
    {
      id: 'message',
      type: 'longText',
      label: 'Anything else?',
      required: false,
      maxLength: 1000,
    },
  ],
  issue: {
    classification: 'feedback',
    labelSet: 'product-review',
    title: '[Export review] {{rating}}/5',
    sections: [
      { heading: 'Rating', field: 'rating', format: 'stars' },
      { heading: 'Comment', field: 'message', omitWhenEmpty: true },
    ],
  },
});
```

Selecting a star updates local state only. Submission occurs only when the explicit Submit button is
activated. Rating and message create one Issue, not separate rating and follow-up Issues.

### 2. CTA-driven question

The host application owns the CTA placement and copy. The CTA calls the variant handle:

```ts
const providerQuestion = BugDrop.registerVariant({
  id: 'cloud-provider-question',
  presentation: { kind: 'modal', size: 'compact' },
  content: {
    title: 'Which cloud provider should we support next?',
    description: 'Tell us what would fit your workflow.',
    submitLabel: 'Send idea',
  },
  fields: [
    {
      id: 'response',
      type: 'longText',
      label: 'Your answer',
      required: true,
      minLength: 2,
      maxLength: 1000,
    },
  ],
  issue: {
    classification: 'feature',
    labelSet: 'cloud-provider',
    title: 'Cloud provider request — {{response}}',
    sections: [{ heading: 'Requested provider or workflow', field: 'response' }],
  },
});

button.addEventListener('click', () => {
  void providerQuestion.open({ context: { surface: 'studio-upload' } });
});
```

Long responses are truncated only in the generated title, never in the Issue section.

### 3. Single-choice poll

This variant proves reusable option rendering and optional detail:

```ts
BugDrop.registerVariant({
  id: 'next-integration-poll',
  presentation: { kind: 'inline' },
  content: {
    title: 'What should we build next?',
    submitLabel: 'Vote',
  },
  fields: [
    {
      id: 'choice',
      type: 'singleChoice',
      label: 'Choose one',
      required: true,
      display: 'cards',
      options: [
        { value: 'onedrive', label: 'OneDrive' },
        { value: 'box', label: 'Box' },
        { value: 'other', label: 'Something else' },
      ],
    },
    {
      id: 'detail',
      type: 'longText',
      label: 'Optional detail',
      maxLength: 500,
    },
  ],
  issue: {
    classification: 'feature',
    labelSet: 'integration-poll',
    title: 'Integration vote — {{choice}}',
    sections: [
      { heading: 'Choice', field: 'choice', format: 'choice' },
      { heading: 'Detail', field: 'detail', omitWhenEmpty: true },
    ],
  },
});
```

Conditional display of `detail` only when `other` is selected is intentionally deferred. Keeping it
visible but optional exercises the same data model without introducing a rules engine.

### 4. Compact suggestion

This variant proves multiple text fields and optional evidence:

```ts
BugDrop.registerVariant({
  id: 'compact-suggestion',
  presentation: { kind: 'modal', size: 'default' },
  content: {
    title: 'Share an idea',
    submitLabel: 'Submit idea',
  },
  fields: [
    {
      id: 'summary',
      type: 'shortText',
      label: 'Idea',
      required: true,
      maxLength: 120,
    },
    {
      id: 'detail',
      type: 'longText',
      label: 'How would this help?',
      maxLength: 2000,
    },
  ],
  issue: {
    classification: 'feature',
    labelSet: 'suggestion',
    title: '[Idea] {{summary}}',
    sections: [
      { heading: 'Idea', field: 'summary' },
      { heading: 'Why it would help', field: 'detail', omitWhenEmpty: true },
    ],
  },
  evidence: {
    screenshot: 'optional',
    attachments: 'off',
    consoleLogs: 'off',
  },
});
```

## Structured Submission Contract

The Worker accepts a discriminated union of the unchanged legacy payload and a new structured
payload:

```ts
interface StructuredFeedbackPayload {
  schemaVersion: 2;
  repo: string;
  variant: {
    id: string;
    configVersion: 1;
    fields: Array<{
      id: string;
      label: string;
      type: 'shortText' | 'longText' | 'rating' | 'singleChoice';
      required?: boolean;
      minLength?: number;
      maxLength?: number;
      min?: number;
      max?: number;
      options?: Array<{ value: string; label: string }>;
    }>;
    issue: VariantIssueTemplate;
  };
  submissionId: string;
  answers: Record<string, string | number | null>;
  context?: Record<string, string | number | boolean | null>;
  screenshot?: string;
  attachments?: FeedbackAttachment[];
  consoleLogs?: ConsoleLogEntry[];
  metadata: FeedbackMetadata;
}
```

The payload includes only Issue-relevant normalized config, not presentation details or success
copy. This lets a hosted Worker format a contributor-defined variant without storing its browser
layout. The Worker validates the normalized schema again and never trusts client validation.

Limits for the first release:

- At most 20 fields.
- At most 50 options across all fields.
- At most 64 characters per field or variant ID.
- At most 5,000 characters per answer.
- At most 20 context keys and 8 KB of serialized context.
- At most 32 KB for the structured payload before evidence data.
- Existing screenshot, attachment, and console-log limits remain in force.

Unknown answers, duplicate fields, non-finite numbers, nested answer values, control characters in
IDs, invalid option values, or an unsupported schema version return `400` without calling GitHub.

## Runtime and DOM Architecture

Introduce a `BugDropRuntime` that owns:

- Legacy adapter.
- Shared core configuration and auth-token provider.
- Variant registry.
- Active modal coordinator.
- Submission service.
- Theme and locale services.

Legacy module-global variables remain behind the adapter initially or move into a dedicated
`LegacyWidgetController` without observable behavior changes.

Suggested source organization:

```text
src/widget/variants/
  types.ts
  validate-config.ts
  registry.ts
  runtime.ts
  submission.ts
  issue-template.ts
  presentations/
    modal.ts
    inline.ts
  fields/
    index.ts
    short-text.ts
    long-text.ts
    rating.ts
    single-choice.ts
```

Each field renderer implements an internal contract:

```ts
interface FieldRenderer<TField extends VariantField> {
  render(field: TField, state: FieldState, environment: RenderEnvironment): HTMLElement;
  read(element: HTMLElement, field: TField): unknown;
  validate(value: unknown, field: TField): ValidationError | null;
  normalize(value: unknown, field: TField): string | number | null;
}
```

Adding a built-in field requires one union member, one renderer registration, focused unit tests,
and documentation. Submission and Issue formatting must not need a field-specific branch except for
explicit display formats such as stars.

Inline mounts create unique hosts marked with `data-bugdrop-instance="<id>"`. They must not reuse
`#bugdrop-host`. Each mount uses a Shadow Root for style isolation and returns an unmount handle.
Only one BugDrop modal may be open at a time; opening another resolves the first outcome as closed.

## Validation and Accessibility

- Configuration errors are reported at registration time.
- Answer validation runs on Submit and focuses the first invalid field.
- Server validation mirrors security-relevant constraints.
- Required status and errors are exposed with `aria-describedby` and `aria-invalid`.
- Rating controls use a radiogroup or equivalent keyboard-operable pattern; arrow keys move the
  selection and Enter/Space selects.
- Selecting a rating never submits automatically.
- Single-choice card and button presentations preserve native radio semantics.
- Modal variants reuse the current focus trap, Escape behavior, background scroll lock, and dialog
  semantics.
- Inline variants do not move focus on mount.
- Loading state disables duplicate Submit activation and remains announced through an ARIA live
  region.
- Touch targets remain at least 44 by 44 CSS pixels.
- Variant styles use the existing theme tokens and custom style configuration.

## Submission Lifecycle and Reliability

1. An instance generates one UUID `submissionId` when its form state is created.
2. Validation failures retain that ID and do not call the Worker.
3. Submit disables the form and requests an auth token through the existing provider.
4. The Worker validates auth, structured config, answers, evidence, and label policy.
5. The Worker creates the GitHub Issue through the existing GitHub App.
6. BugDrop reports success only after it receives an Issue number and URL.
7. A retry reuses the same `submissionId`.

The Issue body includes an invisible marker:

```html
<!-- bugdrop-submission: <submissionId> -->
```

The marker enables best-effort duplicate detection and operator forensics. GitHub search and
Cloudflare KV are not atomic transaction systems, so this design does not promise strict
exactly-once delivery. Network loss after GitHub accepts an Issue can still race a retry.

For structured variants with evidence, create the Issue before optional asset uploads and patch the
Issue afterward. This ensures a screenshot or attachment failure does not discard the response.
Evidence failures are recorded in the Issue and returned as warnings. The legacy evidence ordering
is unchanged for backwards compatibility unless separately migrated and proven equivalent.

Existing rate limits remain the default. Authenticated self-hosts may later add subject- and
variant-aware limits using the already verified token subject, but that is not required to ship the
variant runtime.

## Security and Privacy

- Escape all configured copy before inserting it into widget HTML.
- Reject control characters and invalid IDs in both browser and Worker validation.
- Treat answers and context as untrusted user-generated content.
- Enforce bounded strings, key counts, option counts, and serialized payload sizes.
- Do not accept executable template expressions or callbacks in Worker payloads.
- Do not accept raw GitHub labels from variant submissions.
- Resolve `labelSet` from server-owned per-repository configuration.
- Continue requiring the existing signed token when the Worker has auth enabled.
- Continue redacting URL query strings and hashes.
- Keep screenshots, attachments, and console logs off by default for new variants.
- Host applications remain responsible for applying `data-bugdrop-mask` to sensitive surfaces.
- Do not place secrets, full media content, transcripts, or unconstrained application objects in
  `context`.

## Events and Host Integration

Keep `bugdrop:ready` unchanged. Add namespaced events for optional host analytics:

```text
bugdrop:variant-registered
bugdrop:variant-mounted
bugdrop:variant-opened
bugdrop:variant-submitted
bugdrop:variant-failed
bugdrop:variant-closed
```

Event details contain variant ID, instance ID, presentation, result status, and Issue number when
available. They must not contain answers, comments, email addresses, URLs with query strings, or
arbitrary context.

The runtime does not add an analytics service. Hosts may translate these events into their existing
analytics tools.

## Contributor Extension Model

The first release supports two safe extension paths:

1. Compose a new variant from public field and presentation primitives.
2. Render any custom UI in the host application and call `VariantHandle.submit()`.

Contributors extending BugDrop itself add field types through the internal registry contract. A
public `registerFieldRenderer()` API is deferred because it would require stable DOM lifecycle,
style, accessibility, sanitization, and serialization contracts for arbitrary third-party code.
Headless submission provides equivalent product flexibility without freezing that unsafe API early.

Each built-in example should exist as:

- A documented configuration snippet.
- A local test page.
- A focused renderer test.
- A Worker Issue-formatting test.
- A Playwright flow using the public API.

## Testing and Compatibility Gates

### Legacy regression suite

- Existing script snippets render the same trigger and default form.
- Existing data attributes produce the same config.
- `BugDrop.open()` still skips welcome and opens the legacy form.
- Existing request payload fixtures are byte-for-byte unchanged where timestamps and generated
  evidence are normalized.
- Existing GitHub Issue body and labels are unchanged.
- Screenshot, annotation, retry, locale, theme, and API-only tests continue to pass.

### Variant unit tests

- Complete config validation and descriptive errors.
- Field rendering, keyboard behavior, validation, normalization, and reset.
- Template placeholder resolution and output limits.
- Registry duplicate/reserved ID behavior.
- Independent state for multiple mounts.
- Headless and BugDrop-rendered submissions normalize identically.

### Worker tests

- Legacy and schema-v2 payloads both succeed.
- Unsupported versions and malformed configs fail before GitHub calls.
- Unknown answers and choice values are rejected.
- Label sets cannot be injected by the client.
- Empty optional sections are omitted.
- Mandatory attribution and system information cannot be suppressed.
- Submission markers are present and stable across retries.
- Evidence upload failure still leaves a structured-variant Issue.

### E2E tests

- Each initial acceptance variant in modal and/or inline form.
- Two inline variants coexist with the legacy widget.
- Repeated mount/unmount does not leak hosts, listeners, or state.
- Only one modal opens at a time.
- Explicit Submit is required for rating and choice controls.
- Mobile touch targets, focus order, Escape, and error focus.
- Light, dark, auto, and custom Bleep-like styling.

## Documentation

Add documentation pages or sections for:

- Variant concepts and browser API.
- Field and presentation reference.
- Issue templates and server-owned label sets.
- Modal, inline, and headless examples.
- React integration and cleanup.
- Security and context-data guidance.
- Version pinning and the legacy compatibility promise.
- A contributor guide for adding a built-in field renderer.

The Quick Start remains the current one-line script installation. Variants are presented as an
advanced additive capability.

## Rollout Plan

### Phase 1: Runtime foundation

- Extract a shared submission service without changing legacy payloads.
- Add the variant types, validator, registry, and handle API.
- Add structured Worker payload validation and generic Issue formatting.
- Add legacy compatibility fixtures.

### Phase 2: First renderers

- Add modal and inline presentations.
- Add short text, long text, rating, and single-choice fields.
- Ship the four initial acceptance examples and local test pages.

### Phase 3: Evidence and hardening

- Add optional screenshot/evidence support for variants.
- Add submission markers and best-effort retry deduplication.
- Run accessibility, cross-browser, masking, rate-limit, and failure-path audits.

### Phase 4: Dogfood and documentation

- Dogfood selected examples in a host application such as Bleep without making Bleep-specific copy
  or fields part of BugDrop core.
- Publish contributor and integration documentation.
- Broaden usage only after the legacy and multi-instance E2E contracts remain green.

## Acceptance Criteria

The extension is ready when:

1. Every pre-existing BugDrop unit and E2E test passes without weakening assertions.
2. A page with no variant registrations is observably unchanged.
3. The four example variants can be registered from ordinary application JavaScript.
4. At least two inline instances and the legacy widget coexist on one page.
5. A host-rendered form can submit through the same normalized path.
6. Each successful variant submission returns a GitHub Issue number and creates a correctly
   formatted Issue.
7. Rating selection alone never submits.
8. Client attempts to inject raw GitHub labels fail.
9. New variant code is separated into contributor-oriented modules rather than expanding the
   already large legacy `index.ts` and `ui.ts` files.
10. `widget.v1.js`, the legacy Worker payload, and the current JavaScript API remain backwards
    compatible.

## Strongest Failure Modes to Disprove During Implementation

1. **Legacy regression:** A site that never calls the variant API renders or submits differently.
   Prove this with normalized DOM, payload, and Issue-body contract fixtures plus existing E2E.
2. **Cross-instance state leakage:** One mount changes another mount's answers, theme, open state, or
   cleanup. Prove this with simultaneous mount and repeated unmount tests.
3. **GitHub policy injection:** A modified browser payload applies unauthorized labels or suppresses
   mandatory Issue metadata. Prove this with direct Worker requests that bypass the widget.
4. **False success or duplicate response:** The UI thanks the user without an Issue number, or a
   routine retry creates a second Issue. Prove success gating with fault injection and audit the
   best-effort submission marker behavior explicitly.
5. **Accessibility regression:** Star or card controls work only with a pointer, or a modal loses
   focus containment. Prove keyboard-only flows and automated accessibility assertions.
