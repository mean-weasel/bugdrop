import type { FlowConfig, FlowOpenOptions } from '../../src/widget/flows/public-types';

export type FlowRecipeId = 'bug-report' | 'product-triage' | 'customer-pulse';

export interface FlowRecipe {
  readonly id: FlowRecipeId;
  readonly label: string;
  readonly config: FlowConfig;
  readonly openOptions?: FlowOpenOptions;
}

const bugReport: FlowRecipe = {
  id: 'bug-report',
  label: 'Bug Report',
  openOptions: { context: { surface: 'settings', build: '2026.08.15' } },
  config: {
    configVersion: 1,
    id: 'bug-report',
    presentation: { kind: 'modal', size: 'default', columns: 2 },
    appearance: { theme: 'light', accentColor: '#2563eb', density: 'comfortable' },
    content: {
      successTitle: 'Report received',
      successMessage: 'Thanks for helping us fix this.',
      cancelLabel: 'Discard report',
    },
    forms: [
      {
        id: 'report',
        title: 'What went wrong?',
        description: 'Give us a concise summary and reproducible details.',
        fields: [
          {
            id: 'summary',
            type: 'shortText',
            label: 'Summary',
            required: true,
            maxLength: 120,
            layout: { span: 2 },
          },
          {
            id: 'steps',
            type: 'longText',
            label: 'Steps to reproduce',
            required: true,
            rows: 6,
            layout: { span: 2 },
          },
        ],
      },
      {
        id: 'evidence',
        title: 'Evidence and contact',
        fields: [
          {
            id: 'files',
            type: 'attachments',
            label: 'Attachments',
            required: true,
            maxFiles: 2,
            accept: ['image/png', 'application/pdf'],
            layout: { span: 2 },
          },
          { id: 'logs', type: 'checkbox', label: 'Include console logs', initialValue: true },
          { id: 'name', type: 'shortText', label: 'Your name' },
          { id: 'email', type: 'shortText', label: 'Email' },
        ],
      },
    ],
    screens: [
      {
        id: 'welcome',
        type: 'message',
        title: 'Report a problem',
        description: 'This takes about a minute.',
        continueLabel: 'Start report',
      },
      { id: 'report-screen', type: 'form', form: 'report', continueLabel: 'Add evidence' },
      { id: 'evidence-screen', type: 'form', form: 'evidence' },
      {
        id: 'capture',
        type: 'screenshot',
        mode: 'required',
        title: 'Show us the problem',
        description: 'Capture the page before sending your report.',
      },
    ],
    issue: {
      classification: 'bug',
      title: 'Bug: {{report.summary}}',
      sections: [
        { heading: 'Steps', answer: 'report.steps', format: 'quote' },
        { heading: 'Surface', context: 'surface' },
        { heading: 'Build', context: 'build', format: 'code' },
      ],
    },
    evidence: {
      attachments: 'evidence.files',
      sendConsoleLogs: 'evidence.logs',
      submitter: { name: 'evidence.name', email: 'evidence.email' },
    },
  },
};

const productTriage: FlowRecipe = {
  id: 'product-triage',
  label: 'Product Triage',
  config: {
    configVersion: 1,
    id: 'product-triage',
    presentation: { kind: 'modal', size: 'wide', columns: 2 },
    appearance: { theme: 'dark', accentColor: '#f97316', density: 'compact' },
    forms: [
      {
        id: 'triage',
        title: 'Classify the signal',
        fields: [
          {
            id: 'kind',
            type: 'singleChoice',
            label: 'Feedback type',
            required: true,
            display: 'cards',
            options: [
              { value: 'bug', label: 'Bug', description: 'Something is broken' },
              { value: 'idea', label: 'Idea', description: 'A product opportunity' },
            ],
          },
          {
            id: 'rating',
            type: 'rating',
            label: 'Current experience',
            required: true,
            scale: 5,
            icon: 'star',
            lowLabel: 'Blocked',
            highLabel: 'Excellent',
          },
          { id: 'summary', type: 'shortText', label: 'Summary', required: true },
        ],
      },
      {
        id: 'diagnostics',
        title: 'Add diagnostics',
        fields: [
          { id: 'detail', type: 'longText', label: 'What happened?', rows: 5 },
          {
            id: 'browser',
            type: 'singleChoice',
            label: 'Browser',
            display: 'radio',
            options: [
              { value: 'chromium', label: 'Chromium' },
              { value: 'firefox', label: 'Firefox' },
            ],
          },
        ],
      },
    ],
    screens: [
      { id: 'intro', type: 'message', title: 'Triage product feedback' },
      { id: 'triage-screen', type: 'form', form: 'triage' },
      {
        id: 'diagnostics-screen',
        type: 'form',
        form: 'diagnostics',
        when: {
          all: [
            { answer: 'triage.kind', equals: 'bug' },
            {
              any: [
                { answer: 'triage.rating', equals: 1 },
                { answer: 'triage.rating', equals: 2 },
              ],
            },
          ],
        },
      },
      {
        id: 'capture',
        type: 'screenshot',
        mode: 'optional',
        when: { answer: 'triage.kind', equals: 'bug' },
      },
    ],
    issue: {
      classification: 'feature',
      title: 'Triage: {{triage.summary}}',
      sections: [
        { heading: 'Type', answer: 'triage.kind', format: 'choice' },
        { heading: 'Experience', answer: 'triage.rating', format: 'stars' },
        { heading: 'Diagnostics', answer: 'diagnostics.detail', omitWhenEmpty: true },
        {
          heading: 'Browser',
          answer: 'diagnostics.browser',
          format: 'choice',
          omitWhenEmpty: true,
        },
      ],
    },
  },
};

const customerPulse: FlowRecipe = {
  id: 'customer-pulse',
  label: 'Customer Pulse',
  openOptions: { context: { surface: 'billing' } },
  config: {
    configVersion: 1,
    id: 'customer-pulse',
    presentation: { kind: 'modal', size: 'compact', columns: 1 },
    appearance: { theme: 'auto', density: 'comfortable' },
    content: {
      successTitle: 'Pulse recorded',
      successMessage: 'Thanks for sharing how billing feels today.',
      cancelLabel: 'Not now',
    },
    forms: [
      {
        id: 'pulse',
        title: 'How easy was this?',
        fields: [
          {
            id: 'score',
            type: 'rating',
            label: 'Ease score',
            required: true,
            scale: 10,
            icon: 'number',
            lowLabel: 'Difficult',
            highLabel: 'Easy',
          },
        ],
      },
      {
        id: 'followup',
        title: 'Help us improve billing',
        fields: [
          { id: 'detail', type: 'longText', label: 'What made this difficult?', rows: 4 },
          {
            id: 'contact',
            type: 'singleChoice',
            label: 'May we follow up?',
            display: 'buttons',
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ],
          },
          { id: 'consent', type: 'checkbox', label: 'I consent to a product follow-up' },
        ],
      },
    ],
    screens: [
      { id: 'pulse-screen', type: 'form', form: 'pulse', continueLabel: 'Continue' },
      {
        id: 'followup-screen',
        type: 'form',
        form: 'followup',
        backLabel: 'Change score',
        continueLabel: 'Send pulse',
        when: {
          all: [
            { answer: 'pulse.score', equals: 3 },
            { context: 'surface', equals: 'billing' },
          ],
        },
      },
    ],
    issue: {
      classification: 'question',
      title: 'Billing pulse {{pulse.score}}/10',
      sections: [
        { heading: 'Score', answer: 'pulse.score', format: 'text' },
        { heading: 'Follow-up', answer: 'followup.detail', omitWhenEmpty: true },
        { heading: 'Contact', answer: 'followup.contact', format: 'choice', omitWhenEmpty: true },
        { heading: 'Consent', answer: 'followup.consent', omitWhenEmpty: true },
      ],
    },
  },
};

export const flowRecipes: Readonly<Record<FlowRecipeId, FlowRecipe>> = Object.freeze({
  'bug-report': bugReport,
  'product-triage': productTriage,
  'customer-pulse': customerPulse,
});

export const flowRecipeList = Object.freeze(Object.values(flowRecipes));
