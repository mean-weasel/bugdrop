import { createAnnotator, type Tool } from './annotator';
import { createModal, redactionNoteHtml } from './ui';
import { t } from './i18n';

export function showAnnotationStep(
  root: HTMLElement,
  screenshot: string,
  redactionCount = 0,
  opts?: {
    redactionUnavailable?: boolean;
    redactionLimitations?: boolean;
    selectedElementCapture?: boolean;
  }
): Promise<string | 'retake' | 'cancel'> {
  return new Promise(resolve => {
    const redactionMessages: string[] = [];
    if (opts?.redactionUnavailable) {
      redactionMessages.push(t().viewportRedactionUnavailableNote);
    } else {
      if (redactionCount > 0) {
        redactionMessages.push(t().redactionCountNote(redactionCount));
      }
      if (opts?.redactionLimitations) {
        redactionMessages.push(t().redactionLimitationsNote);
      }
    }
    const redactionNote = redactionMessages.length
      ? redactionNoteHtml(redactionMessages.join(' '))
      : '';
    const configLinkHtml =
      '<a href="https://bugdrop.dev/docs/configuration#select-element-screenshots" target="_blank" rel="noopener noreferrer">data-element-context-max-area</a>';
    const selectedElementNote = opts?.selectedElementCapture
      ? `
        <p class="bd-selected-element-note" style="margin: -4px 0 12px; color: var(--bd-text-secondary); font-size: 13px;">
          ${t().selectedElementNote(configLinkHtml)}
        </p>
      `
      : '';
    const modal = createModal(
      root,
      t().reviewScreenshotTitle,
      `
        ${redactionNote}
        <p style="margin: 0 0 12px; color: var(--bd-text-secondary); font-size: 13px;">
          ${t().annotationInstruction}
        </p>
        ${selectedElementNote}
        <div class="bd-tools">
          <button class="bd-tool active" data-tool="draw">✏️ ${t().toolDraw}</button>
          <button class="bd-tool" data-tool="arrow">➡️ ${t().toolArrow}</button>
          <button class="bd-tool" data-tool="rect">▢ ${t().toolRectangle}</button>
          <button class="bd-tool" data-tool="redact">${t().toolRedact}</button>
          <button class="bd-tool" data-action="undo">↶ ${t().undo}</button>
        </div>
        <div id="annotation-canvas" class="bd-annotation-stage"></div>
        <div class="bd-actions">
          <button class="bd-btn bd-btn-secondary" data-action="retake">${t().retake}</button>
          <button class="bd-btn bd-btn-primary" data-action="done">${t().submitFeedback}</button>
        </div>
      `,
      false,
      'bd-modal--annotator'
    );

    const canvasContainer = modal.querySelector('#annotation-canvas') as HTMLElement;
    const annotator = createAnnotator(canvasContainer, screenshot);

    const toolButtons = modal.querySelectorAll('[data-tool]');
    toolButtons.forEach(btn => {
      btn.addEventListener('click', e => {
        const target = e.currentTarget as HTMLElement;
        const tool = target.dataset.tool;

        if (tool) {
          toolButtons.forEach(b => b.classList.remove('active'));
          target.classList.add('active');
          annotator.setTool(tool as Tool);
        }
      });
    });

    const undoBtn = modal.querySelector('[data-action="undo"]') as HTMLElement | null;
    undoBtn?.addEventListener('click', () => annotator.undo());

    const closeBtn = modal.querySelector('.bd-close') as HTMLElement;
    const retakeBtn = modal.querySelector('[data-action="retake"]') as HTMLElement;
    const doneBtn = modal.querySelector('[data-action="done"]') as HTMLElement;

    closeBtn?.addEventListener('click', () => {
      annotator.destroy();
      modal.remove();
      resolve('cancel');
    });

    retakeBtn?.addEventListener('click', () => {
      annotator.destroy();
      modal.remove();
      resolve('retake');
    });

    doneBtn?.addEventListener('click', () => {
      const annotated = annotator.getImageData();
      annotator.destroy();
      modal.remove();
      resolve(annotated);
    });
  });
}
