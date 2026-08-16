import { describe, expect, it } from 'vitest';
import { normalizeFlowDefinition } from '../src/widget/flows/definition';
import { FlowRuntime } from '../src/widget/flows/runtime';
import { validateAndFreezeFlowConfig } from '../src/widget/flows/validate-config';
import { flowConfig } from './flowConfig.test';

describe('flow runtime', () => {
  it('navigates visible screens, retains Back answers, and clears newly hidden answers/evidence', () => {
    const runtime = new FlowRuntime(
      normalizeFlowDefinition(validateAndFreezeFlowConfig(flowConfig())),
      {}
    );
    expect(runtime.current()?.id).toBe('intro');
    runtime.next();
    runtime.setFormAnswers('triage', { kind: 'bug', summary: 'Broken' });
    runtime.next();
    expect(runtime.current()?.id).toBe('detail-step');
    runtime.setFormAnswers('detail', { description: 'Steps', logs: true, files: [] });
    runtime.next();
    runtime.capture = {
      screenshot: 'data:image/png;base64,x',
      elementSelector: null,
      fullElementSelector: null,
    };
    runtime.back();
    runtime.back();
    runtime.setFormAnswers('triage', { kind: 'idea', summary: 'Better' });
    expect(runtime.answers['detail.description']).toBeUndefined();
    expect(runtime.capture).toBeNull();
    expect(runtime.current()?.id).toBe('triage-step');
  });

  it('uses visible routes and removes initially hidden answers before Issue compilation', () => {
    const config = flowConfig();
    const runtime = new FlowRuntime(
      normalizeFlowDefinition(validateAndFreezeFlowConfig(config)),
      {},
      {
        'triage.kind': 'idea',
        'triage.summary': 'Idea',
        'detail.description': 'must disappear',
      }
    );
    expect(runtime.answers['detail.description']).toBeUndefined();
    runtime.next();
    expect(runtime.route()).toMatchObject({
      position: 2,
      total: 2,
      canGoBack: true,
      hasNext: false,
    });
  });

  it('does not clear still-visible form state during Back snapshots', () => {
    const runtime = new FlowRuntime(
      normalizeFlowDefinition(validateAndFreezeFlowConfig(flowConfig())),
      {}
    );
    runtime.next();
    runtime.setFormAnswers('triage', { kind: 'bug', summary: 'Broken' });
    runtime.next();
    runtime.setFormAnswers('detail', { description: 'Retained', logs: false, files: [] });
    runtime.back();
    expect(runtime.answers['detail.description']).toBe('Retained');
    expect(runtime.current()?.id).toBe('triage-step');
  });

  it('recovers to the nearest visible screen after cascading branch changes', () => {
    const config = flowConfig();
    config.screens = [
      { id: 'triage-step', type: 'form', form: 'triage' },
      {
        id: 'detail-step',
        type: 'form',
        form: 'detail',
        when: { answer: 'triage.kind', equals: 'bug' },
      },
      {
        id: 'evidence',
        type: 'screenshot',
        mode: 'optional',
        when: { answer: 'detail.description', equals: 'show' },
      },
    ];
    const runtime = new FlowRuntime(
      normalizeFlowDefinition(validateAndFreezeFlowConfig(config)),
      {}
    );
    runtime.setFormAnswers('triage', { kind: 'bug', summary: 'Broken' });
    runtime.next();
    runtime.setFormAnswers('detail', { description: 'show', logs: false, files: [] });
    runtime.next();
    runtime.capture = {
      screenshot: 'data:image/png;base64,x',
      elementSelector: null,
      fullElementSelector: null,
    };

    runtime.setFormAnswers('triage', { kind: 'idea', summary: 'Better' });
    expect(runtime.current()?.id).toBe('triage-step');
    expect(runtime.answers['detail.description']).toBeUndefined();
    expect(runtime.capture).toBeNull();
    expect(runtime.route()).toMatchObject({ position: 1, total: 1, canGoBack: false });
  });
});
