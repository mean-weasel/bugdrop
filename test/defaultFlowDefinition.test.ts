import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEFINITION_ID,
  normalizeDefaultDefinition,
  type DefaultDefinitionInput,
} from '../src/widget/default-flow/definition';

function input(overrides: Partial<DefaultDefinitionInput> = {}): DefaultDefinitionInput {
  return {
    repo: 'owner/repo',
    apiUrl: 'https://bugdrop.example/api',
    welcome: 'once',
    screenshotMode: 'optional',
    skipWelcome: false,
    hasSeenWelcome: false,
    showName: true,
    requireName: false,
    showEmail: true,
    requireEmail: true,
    sendConsoleLogs: true,
    screenshotScale: 1.5,
    elementContextMaxArea: 2,
    accentColor: '#123456',
    categoryLabels: { bug: ['defect', 'triage'] },
    issueLinkVisibility: 'always',
    ...overrides,
  };
}

describe('private default definition normalizer', () => {
  it.each([
    ['always', false, false, true, false],
    ['once', false, false, true, true],
    ['once', false, true, false, false],
    ['never', false, false, false, false],
    ['always', true, false, false, false],
  ] as const)(
    'normalizes welcome=%s skip=%s seen=%s',
    (welcome, skipWelcome, hasSeenWelcome, enabled, remember) => {
      const definition = normalizeDefaultDefinition(
        input({
          welcome,
          skipWelcome,
          hasSeenWelcome,
        })
      );

      expect(definition.id).toBe(DEFAULT_DEFINITION_ID);
      expect(definition.flow.compiler).toBe('bugdrop-flow@1');
      expect(definition.flow.config.configVersion).toBe(1);
      expect(definition.flow.screens.map(screen => screen.id)).toEqual([
        'welcome',
        'details',
        'screenshot',
      ]);
      expect(definition.steps[0]).toEqual({ kind: 'welcome', enabled, remember });
    }
  );

  it.each(['optional', 'auto', 'required'] as const)('preserves screenshot mode %s', mode => {
    const definition = normalizeDefaultDefinition(
      input({
        welcome: 'never',
        screenshotMode: mode,
      })
    );

    expect(definition.steps).toEqual([
      { kind: 'welcome', enabled: false, remember: false },
      {
        kind: 'details',
        repo: 'owner/repo',
        showName: true,
        requireName: false,
        showEmail: true,
        requireEmail: true,
        sendConsoleLogs: true,
      },
      {
        kind: 'screenshot',
        mode,
        repo: 'owner/repo',
        screenshotScale: 1.5,
        elementContextMaxArea: 2,
        accentColor: '#123456',
      },
    ]);
    expect(definition.system).toEqual({
      preflight: {
        kind: 'installation',
        repo: 'owner/repo',
        apiUrl: 'https://bugdrop.example/api',
        authTokenProvider: undefined,
      },
      submission: {
        kind: 'legacy-feedback',
        repo: 'owner/repo',
        apiUrl: 'https://bugdrop.example/api',
        authTokenProvider: undefined,
        categoryLabels: { bug: ['defect', 'triage'] },
        issueLinkVisibility: 'always',
      },
    });
  });

  it('returns a deeply immutable built-in definition', () => {
    const definition = normalizeDefaultDefinition(
      input({
        screenshotMode: 'required',
      })
    );

    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.flow.config)).toBe(true);
    expect(Object.isFrozen(definition.steps)).toBe(true);
    expect(definition.steps.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(definition.system)).toBe(true);
    expect(Object.isFrozen(definition.system.preflight)).toBe(true);
    expect(Object.isFrozen(definition.system.submission)).toBe(true);
    expect(Object.isFrozen(definition.system.submission.categoryLabels)).toBe(true);
    expect(Object.isFrozen(definition.system.submission.categoryLabels?.bug)).toBe(true);
  });
});
