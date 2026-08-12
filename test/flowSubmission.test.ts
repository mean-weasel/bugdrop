// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitFlow } from '../src/widget/flows/submission';
import { flowConfig } from './flowConfig.test';

describe('flow legacy submission', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('carries mapped screenshot, attachments, logs, and submitter through the legacy recipe', async () => {
    const config = flowConfig();
    config.forms[0]!.fields.push({ id: 'name', type: 'shortText', label: 'Name' });
    config.evidence = { ...config.evidence, submitter: { name: 'triage.name' } };
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            issueNumber: 9,
            issueUrl: 'https://github.com/owner/repo/issues/9',
            isPublic: false,
            labelMappingWarnings: ['Skipped an invalid label'],
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'id' });
    await submitFlow(
      {
        repo: 'owner/repo',
        apiUrl: '/api',
        categoryLabels: { bug: ['defect', 'needs-triage'] },
      },
      config,
      {
        'triage.summary': 'Crash',
        'triage.name': 'Ada',
        'detail.description': 'Steps',
        'detail.logs': false,
        'detail.files': [{ name: 'trace.txt' }],
      },
      {},
      {
        screenshot: 'data:image/png;base64,x',
        elementSelector: '#save',
        fullElementSelector: 'html body #save',
      }
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({
      repo: 'owner/repo',
      title: 'Crash',
      category: 'bug',
      categoryLabels: { bug: ['defect', 'needs-triage'] },
      screenshot: 'data:image/png;base64,x',
      attachments: [{ name: 'trace.txt' }],
      submitter: { name: 'Ada' },
      metadata: { elementSelector: '#save' },
    });
    expect(body.kind).toBeUndefined();
    await expect(
      submitFlow(
        { repo: 'owner/repo', apiUrl: '/api' },
        config,
        { 'triage.summary': 'Crash' },
        {},
        null
      )
    ).resolves.toMatchObject({ labelMappingWarnings: ['Skipped an invalid label'] });
  });
  it('keeps retryable failures explicit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Nope' }), { status: 500 }))
    );
    await expect(
      submitFlow(
        { repo: 'owner/repo', apiUrl: '/api' },
        flowConfig(),
        { 'triage.summary': 'Crash' },
        {},
        null
      )
    ).rejects.toThrow('Nope');
  });

  it.each([
    [0, 'https://github.com/owner/repo/issues/0'],
    [9, 'https://example.com/owner/repo/issues/9'],
    [9, 'https://github.com/other/repo/issues/9'],
    [9, 'https://github.com/owner/repo/issues/10'],
  ])('rejects non-canonical legacy Issue results', async (issueNumber, issueUrl) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, issueNumber, issueUrl, isPublic: false }))
      )
    );
    await expect(
      submitFlow(
        { repo: 'owner/repo', apiUrl: '/api' },
        flowConfig(),
        { 'triage.summary': 'Crash' },
        {},
        null
      )
    ).rejects.toThrow('invalid Issue result');
  });
});
