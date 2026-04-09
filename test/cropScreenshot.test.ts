// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPixelRatio,
  getDomNodeCount,
  isFullPageDisabled,
  FULL_PAGE_DISABLE_THRESHOLD,
  cropScreenshot,
} from '../src/widget/screenshot';

describe('getPixelRatio', () => {
  let originalDPR: number;

  beforeEach(() => {
    originalDPR = window.devicePixelRatio;
  });

  afterEach(() => {
    Object.defineProperty(window, 'devicePixelRatio', { value: originalDPR, writable: true });
    vi.restoreAllMocks();
  });

  it('returns 1 for full-page captures on complex DOMs (>3000 elements)', () => {
    const elements = new Array(3001).fill(document.createElement('div'));
    vi.spyOn(document.body, 'querySelectorAll').mockReturnValue(
      elements as unknown as NodeListOf<Element>
    );

    expect(getPixelRatio(true)).toBe(1);
  });

  it('returns normal ratio for full-page captures on simple DOMs', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true });
    vi.spyOn(document.body, 'querySelectorAll').mockReturnValue(
      [] as unknown as NodeListOf<Element>
    );

    expect(getPixelRatio(true)).toBe(2);
  });

  it('ignores DOM complexity for non-full-page captures', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true });
    const elements = new Array(5000).fill(document.createElement('div'));
    vi.spyOn(document.body, 'querySelectorAll').mockReturnValue(
      elements as unknown as NodeListOf<Element>
    );

    expect(getPixelRatio(false)).toBe(2);
  });

  it('uses screenshotScale when higher than devicePixelRatio', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, writable: true });
    vi.spyOn(document.body, 'querySelectorAll').mockReturnValue(
      [] as unknown as NodeListOf<Element>
    );

    expect(getPixelRatio(true, 3)).toBe(3);
  });

  it('defaults to scale 2 when screenshotScale is undefined', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, writable: true });
    vi.spyOn(document.body, 'querySelectorAll').mockReturnValue(
      [] as unknown as NodeListOf<Element>
    );

    expect(getPixelRatio(true)).toBe(2);
  });

  it('falls back to 1 when devicePixelRatio is falsy', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 0, writable: true });
    vi.spyOn(document.body, 'querySelectorAll').mockReturnValue(
      [] as unknown as NodeListOf<Element>
    );

    expect(getPixelRatio(false)).toBe(2); // max(0||1, 2) = 2
  });
});

describe('getDomNodeCount', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the number of child elements in document.body', () => {
    const elements = new Array(500).fill(document.createElement('div'));
    vi.spyOn(document.body, 'querySelectorAll').mockReturnValue(
      elements as unknown as NodeListOf<Element>
    );
    expect(getDomNodeCount()).toBe(500);
  });
});

describe('isFullPageDisabled', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns true when node count >= FULL_PAGE_DISABLE_THRESHOLD', () => {
    const elements = new Array(FULL_PAGE_DISABLE_THRESHOLD).fill(document.createElement('div'));
    vi.spyOn(document.body, 'querySelectorAll').mockReturnValue(
      elements as unknown as NodeListOf<Element>
    );
    expect(isFullPageDisabled()).toBe(true);
  });

  it('returns false when node count < FULL_PAGE_DISABLE_THRESHOLD', () => {
    const elements = new Array(FULL_PAGE_DISABLE_THRESHOLD - 1).fill(document.createElement('div'));
    vi.spyOn(document.body, 'querySelectorAll').mockReturnValue(
      elements as unknown as NodeListOf<Element>
    );
    expect(isFullPageDisabled()).toBe(false);
  });
});

describe('cropScreenshot', () => {
  it('is exported from screenshot module', () => {
    expect(typeof cropScreenshot).toBe('function');
  });
});
