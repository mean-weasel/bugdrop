type Tool = 'draw' | 'arrow' | 'rect' | 'text';

interface Point {
  x: number;
  y: number;
}

export function createAnnotator(
  container: HTMLElement,
  imageData: string,
  accentColor?: string
): {
  setTool: (tool: Tool) => void;
  undo: () => void;
  getImageData: () => string;
  destroy: () => void;
} {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  let currentTool: Tool = 'draw';
  let isDrawing = false;
  let points: Point[] = [];
  const history: ImageData[] = [];

  // Load image
  const img = new Image();
  img.onload = () => {
    // Scale to fit container
    const maxWidth = container.clientWidth || 600;
    const scale = Math.min(1, maxWidth / img.width);

    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    canvas.style.maxWidth = '100%';
    canvas.style.cursor = 'crosshair';

    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);

    // Save initial state
    saveState();
  };
  img.src = imageData;

  container.appendChild(canvas);

  // Drawing settings
  const color = accentColor || '#ff0000';
  const lineWidth = 3;

  function saveState() {
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }

  function getCanvasPoint(e: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    const scaleX = img.width / rect.width;
    const scaleY = img.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function drawLine(from: Point, to: Point) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function drawArrow(from: Point, to: Point) {
    // Line
    drawLine(from, to);

    // Arrowhead
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const headLength = 15;

    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - headLength * Math.cos(angle - Math.PI / 6),
      to.y - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      to.x - headLength * Math.cos(angle + Math.PI / 6),
      to.y - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawRect(from: Point, to: Point) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
  }

  // Event handlers
  canvas.addEventListener('mousedown', e => {
    isDrawing = true;
    points = [getCanvasPoint(e)];
    saveState();
  });

  canvas.addEventListener('mousemove', e => {
    if (!isDrawing) return;

    const point = getCanvasPoint(e);

    if (currentTool === 'draw') {
      drawLine(points[points.length - 1], point);
      points.push(point);
    } else {
      // Preview for arrow/rect
      ctx.putImageData(history[history.length - 1], 0, 0);

      if (currentTool === 'arrow') {
        drawArrow(points[0], point);
      } else if (currentTool === 'rect') {
        drawRect(points[0], point);
      }
    }
  });

  canvas.addEventListener('mouseup', e => {
    if (!isDrawing) return;
    isDrawing = false;

    const point = getCanvasPoint(e);

    if (currentTool === 'arrow') {
      drawArrow(points[0], point);
    } else if (currentTool === 'rect') {
      drawRect(points[0], point);
    }

    points = [];
  });

  return {
    setTool(tool: Tool) {
      currentTool = tool;
    },

    undo() {
      if (history.length > 1) {
        history.pop();
        ctx.putImageData(history[history.length - 1], 0, 0);
      }
    },

    getImageData(): string {
      return canvas.toDataURL('image/png');
    },

    destroy() {
      canvas.remove();
    },
  };
}
