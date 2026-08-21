// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { constrainScreenshotSize, getBase64DataUrlByteLength } from '../src/widget/screenshot-size';

function dataUrlWithBytes(byteLength: number): string {
  return `data:image/png;base64,${Buffer.alloc(byteLength).toString('base64')}`;
}

describe('screenshot size constraint', () => {
  let OriginalImage: typeof Image;

  beforeEach(() => {
    OriginalImage = window.Image;
    (window as unknown as { Image: unknown }).Image = class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 3_200;
      naturalHeight = 8_600;
      width = 3_200;
      height = 8_600;

      set src(_: string) {
        Promise.resolve().then(() => this.onload?.());
      }
    };
  });

  afterEach(() => {
    (window as unknown as { Image: unknown }).Image = OriginalImage;
    vi.restoreAllMocks();
  });

  it('calculates decoded byte length for padded base64 data URLs', () => {
    expect(getBase64DataUrlByteLength(dataUrlWithBytes(7))).toBe(7);
  });

  it('leaves screenshots below the limit byte-for-byte unchanged', async () => {
    const screenshot = dataUrlWithBytes(1_024);
    const toDataUrl = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');

    await expect(constrainScreenshotSize(screenshot, 2_048)).resolves.toBe(screenshot);
    expect(toDataUrl).not.toHaveBeenCalled();
  });

  it('downscales an oversized screenshot below the upload limit', async () => {
    const oversized = dataUrlWithBytes(7_200);
    const resized = dataUrlWithBytes(4_400);
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(resized);

    await expect(constrainScreenshotSize(oversized, 5_000)).resolves.toBe(resized);
    expect(getBase64DataUrlByteLength(resized)).toBeLessThanOrEqual(5_000);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(drawImage.mock.calls[0]?.slice(1)).toEqual([0, 0, 2_529, 6_798]);
  });

  it('preserves the original for visible server-side recovery when resizing fails', async () => {
    const oversized = dataUrlWithBytes(7_200);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(oversized);

    await expect(constrainScreenshotSize(oversized, 5_000)).resolves.toBe(oversized);
    expect(warning).toHaveBeenCalledWith(
      '[BugDrop] Unable to resize oversized screenshot; submitting original.',
      expect.any(Error)
    );
  });
});
