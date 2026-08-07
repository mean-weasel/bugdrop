// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const annotatorMocks = vi.hoisted(() => ({
  createAnnotator: vi.fn(),
  setTool: vi.fn(),
  undo: vi.fn(),
  getImageData: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock('../src/widget/annotator', () => ({
  createAnnotator: annotatorMocks.createAnnotator,
}));

beforeEach(() => {
  annotatorMocks.createAnnotator.mockReturnValue({
    setTool: annotatorMocks.setTool,
    undo: annotatorMocks.undo,
    getImageData: annotatorMocks.getImageData,
    destroy: annotatorMocks.destroy,
  });
  annotatorMocks.getImageData.mockReturnValue('annotated-image');
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof matchMedia;
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

async function openAnnotation(
  redactionCount = 0,
  opts?: Parameters<typeof import('../src/widget/annotation-flow').showAnnotationStep>[3]
) {
  const root = document.createElement('div');
  document.body.append(root);
  const { showAnnotationStep } = await import('../src/widget/annotation-flow');
  const result = showAnnotationStep(root, 'data:image/png;base64,source', redactionCount, opts);
  return { root, result };
}

describe('annotation flow', () => {
  it('creates the annotator, switches active tools, and delegates undo', async () => {
    const { root, result } = await openAnnotation();
    expect(annotatorMocks.createAnnotator).toHaveBeenCalledWith(
      root.querySelector('#annotation-canvas'),
      'data:image/png;base64,source'
    );

    const arrow = root.querySelector<HTMLElement>('[data-tool="arrow"]')!;
    arrow.click();
    root.querySelector<HTMLElement>('[data-action="undo"]')?.click();

    expect(annotatorMocks.setTool).toHaveBeenCalledTimes(1);
    expect(annotatorMocks.setTool).toHaveBeenCalledWith('arrow');
    expect(arrow.classList).toContain('active');
    expect(root.querySelector('[data-tool="draw"]')?.classList).not.toContain('active');
    expect(annotatorMocks.undo).toHaveBeenCalledTimes(1);
    root.querySelector<HTMLElement>('.bd-close')?.click();
    await expect(result).resolves.toBe('cancel');
  });

  it.each([
    ['close', '.bd-close', 'cancel'],
    ['retake', '[data-action="retake"]', 'retake'],
  ] as const)(
    '%s destroys once, removes the modal, and resolves %s',
    async (_, selector, expected) => {
      const { root, result } = await openAnnotation();
      const button = root.querySelector<HTMLElement>(selector)!;
      button.click();

      await expect(result).resolves.toBe(expected);
      expect(annotatorMocks.destroy).toHaveBeenCalledTimes(1);
      expect(annotatorMocks.getImageData).not.toHaveBeenCalled();
      expect(root.querySelector('.bd-overlay')).toBeNull();
    }
  );

  it('gets the image before cleanup and resolves the annotation', async () => {
    const order: string[] = [];
    annotatorMocks.getImageData.mockImplementation(() => {
      order.push('image');
      return 'annotated-image';
    });
    annotatorMocks.destroy.mockImplementation(() => order.push('destroy'));
    const { root, result } = await openAnnotation();

    root.querySelector<HTMLElement>('[data-action="done"]')?.click();

    await expect(result).resolves.toBe('annotated-image');
    expect(order).toEqual(['image', 'destroy']);
    expect(annotatorMocks.getImageData).toHaveBeenCalledTimes(1);
    expect(annotatorMocks.destroy).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.bd-overlay')).toBeNull();
  });

  it('renders combined redaction guidance and a safe selected-element config link', async () => {
    const { root, result } = await openAnnotation(2, {
      redactionLimitations: true,
      selectedElementCapture: true,
    });

    expect(root.textContent).toContain('2 private items were marked for redaction');
    expect(root.textContent).toContain('does not inspect pixels inside embedded');
    expect(root.textContent).toContain('Check that no sensitive information is visible');
    const link = root.querySelector<HTMLAnchorElement>('.bd-selected-element-note a');
    expect(link?.href).toBe('https://bugdrop.dev/docs/configuration#select-element-screenshots');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toBe('noopener noreferrer');
    root.querySelector<HTMLElement>('.bd-close')?.click();
    await result;
  });

  it('uses unavailable privacy guidance instead of count and limitation details', async () => {
    const { root, result } = await openAnnotation(4, {
      redactionUnavailable: true,
      redactionLimitations: true,
    });

    expect(root.textContent).toContain('could not apply automatic private-field masks');
    expect(root.textContent).not.toContain('4 private items');
    expect(root.textContent).not.toContain('does not inspect pixels inside embedded');
    root.querySelector<HTMLElement>('[data-action="retake"]')?.click();
    await result;
  });
});
