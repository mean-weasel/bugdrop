import { installRadixDialogCompatibility } from '../radix-compat';
import { setActiveVariantModal } from '../variants/modal-coordinator';

export interface FlowModalState {
  readonly host: HTMLElement;
  readonly shadow: ShadowRoot;
  readonly overlay: HTMLElement;
  activate(close: () => void): void;
  dispose(): void;
}

export function createFlowModalState(
  flowId: string,
  instanceId: string,
  createRoot: (shadow: ShadowRoot) => { root: HTMLElement; dispose(): void },
  onKeydown: (event: Event) => void,
  onBackdrop: (event: PointerEvent) => void
): FlowModalState {
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const previousOverflow = document.body.style.getPropertyValue('overflow');
  const previousOverflowPriority = document.body.style.getPropertyPriority('overflow');
  const host = document.createElement('div');
  host.dataset.bugdropOwned = '';
  host.dataset.bugdropFlow = flowId;
  host.dataset.bugdropInstance = instanceId;
  Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '2147483646' });
  const shadow = host.attachShadow({ mode: 'open' });
  const styled = createRoot(shadow);
  const overlay = document.createElement('div');
  overlay.className = 'bdv-overlay';
  styled.root.appendChild(overlay);
  let unregister = () => {};
  let disposeRadix = () => {};
  let disposed = false;
  return {
    host,
    shadow,
    overlay,
    activate(close) {
      document.body.style.setProperty('overflow', 'hidden');
      document.body.appendChild(host);
      disposeRadix = installRadixDialogCompatibility(host);
      shadow.addEventListener('keydown', onKeydown);
      overlay.addEventListener('pointerdown', onBackdrop);
      unregister = setActiveVariantModal({ close });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unregister();
      shadow.removeEventListener('keydown', onKeydown);
      overlay.removeEventListener('pointerdown', onBackdrop);
      disposeRadix();
      styled.dispose();
      host.remove();
      if (previousOverflow)
        document.body.style.setProperty('overflow', previousOverflow, previousOverflowPriority);
      else document.body.style.removeProperty('overflow');
      if (previousFocus?.isConnected) previousFocus.focus();
    },
  };
}
