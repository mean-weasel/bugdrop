export async function cropScreenshot(
  imageDataUrl: string,
  rect: DOMRect,
  pixelRatio: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const cropW = Math.round(rect.width * pixelRatio);
      const cropH = Math.round(rect.height * pixelRatio);
      canvas.width = cropW;
      canvas.height = cropH;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(
        img,
        Math.round(rect.x * pixelRatio),
        Math.round(rect.y * pixelRatio),
        cropW,
        cropH,
        0,
        0,
        cropW,
        cropH
      );

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = imageDataUrl;
  });
}
