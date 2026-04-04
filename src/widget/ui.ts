declare const __BUGDROP_VERSION__: string;

interface WidgetConfig {
  repo: string;
  apiUrl: string;
  position: 'bottom-right' | 'bottom-left';
  theme: 'light' | 'dark' | 'auto';
  accentColor?: string;
  font?: string;
  radius?: string;
  bgColor?: string;
  textColor?: string;
  borderWidth?: string;
  borderColor?: string;
  shadow?: string;
}

// Detect system dark mode preference
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function injectStyles(shadow: ShadowRoot, config: WidgetConfig) {
  const pos = config.position === 'bottom-left' ? 'left: 20px' : 'right: 20px';
  // Resolve 'auto' to actual theme based on system preference
  const resolvedTheme = config.theme === 'auto' ? getSystemTheme() : config.theme;
  const isDark = resolvedTheme === 'dark';

  // Determine font settings
  const useInheritFont = config.font === 'inherit';
  const customFont = config.font && config.font !== 'inherit' ? config.font : null;
  const fontImport =
    useInheritFont || customFont
      ? ''
      : `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');`;
  const fontFamily = useInheritFont
    ? 'inherit'
    : customFont
      ? `${customFont}, system-ui, sans-serif`
      : `'Space Grotesk', system-ui, sans-serif`;

  // Determine radius settings
  const radiusPx = config.radius !== undefined ? parseInt(config.radius, 10) : null;
  const radiusSm = radiusPx !== null ? `${radiusPx}px` : '6px';
  const radiusMd = radiusPx !== null ? `${Math.round(radiusPx * 1.4)}px` : '10px';
  const radiusLg = radiusPx !== null ? `${Math.round(radiusPx * 2)}px` : '14px';

  // Determine border settings
  const borderW = config.borderWidth ? parseInt(config.borderWidth, 10) : null;
  const borderC = config.borderColor || null;

  // Determine shadow preset
  const shadowPreset = config.shadow || null; // 'none', 'soft', 'hard'

  const styles = document.createElement('style');
  styles.textContent = `
    ${fontImport}

    :host {
      /* Typography */
      --bd-font: ${fontFamily};

      /* Radius */
      --bd-radius-sm: ${radiusSm};
      --bd-radius-md: ${radiusMd};
      --bd-radius-lg: ${radiusLg};

      /* Border */
      --bd-border-style: ${borderW !== null ? `${borderW}px` : '1px'} solid var(--bd-border);

      /* Transitions */
      --bd-transition: 0.15s ease;
      --bd-transition-slow: 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Light Theme (Default) */
    .bd-root {
      --bd-bg-primary: #fafaf9;
      --bd-bg-secondary: #f5f5f4;
      --bd-bg-tertiary: #e7e5e4;
      --bd-text-primary: #1c1917;
      --bd-text-secondary: #57534e;
      --bd-text-muted: #a8a29e;
      --bd-border: #e7e5e4;
      --bd-border-focus: #14b8a6;
      --bd-primary: #14b8a6;
      --bd-primary-hover: #0d9488;
      --bd-primary-text: #ffffff;
      --bd-overlay-bg: rgba(0, 0, 0, 0.4);
      --bd-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
      --bd-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
      --bd-shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.12);
      --bd-shadow-glow: none;
      --bd-success: #22c55e;
      --bd-error: #ef4444;
    }

    /* Dark Theme */
    .bd-root.bd-dark {
      --bd-bg-primary: #0f172a;
      --bd-bg-secondary: #1e293b;
      --bd-bg-tertiary: #334155;
      --bd-text-primary: #f1f5f9;
      --bd-text-secondary: #94a3b8;
      --bd-text-muted: #64748b;
      --bd-border: #334155;
      --bd-border-focus: #22d3ee;
      --bd-primary: #22d3ee;
      --bd-primary-hover: #06b6d4;
      --bd-primary-text: #0f172a;
      --bd-overlay-bg: rgba(0, 0, 0, 0.6);
      --bd-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
      --bd-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
      --bd-shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.4);
      --bd-shadow-glow: 0 0 40px rgba(34, 211, 238, 0.15);
      --bd-success: #34d399;
      --bd-error: #f87171;
    }

    .bd-root {
      font-family: var(--bd-font);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    * {
      box-sizing: border-box;
      font-family: inherit;
    }

    /* Trigger Button (Pill) */
    .bd-trigger {
      position: fixed;
      bottom: 20px;
      ${pos};
      height: 44px;
      padding: 0 16px;
      border-radius: ${radiusPx !== null ? `${radiusPx * 2}px` : '22px'};
      border: ${borderW !== null ? 'var(--bd-border-style)' : 'none'};
      background: var(--bd-primary);
      color: var(--bd-primary-text);
      cursor: pointer;
      box-shadow:
        var(--bd-shadow-md),
        0 0 0 0 var(--bd-primary);
      z-index: 999999;
      transition: transform var(--bd-transition), box-shadow var(--bd-transition), opacity var(--bd-transition);
      display: flex;
      align-items: center;
      gap: 8px;
      animation: bd-triggerSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .bd-trigger:hover {
      transform: scale(1.03);
      box-shadow:
        var(--bd-shadow-lg),
        0 0 20px color-mix(in srgb, var(--bd-primary) 30%, transparent);
    }

    .bd-trigger:active {
      transform: scale(0.97);
    }

    .bd-trigger-icon {
      font-size: 18px;
      line-height: 1;
    }

    .bd-trigger-icon img {
      width: 18px;
      height: 18px;
      object-fit: contain;
      display: block;
    }

    .bd-trigger-label {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    @keyframes bd-triggerSlideIn {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.9);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    /* Pull Tab (shown after dismissal) */
    .bd-pull-tab {
      position: fixed;
      bottom: 20px;
      right: 0;
      width: 24px;
      height: 48px;
      border-radius: 8px 0 0 8px;
      border: none;
      background: var(--bd-primary);
      color: var(--bd-primary-text);
      cursor: pointer;
      box-shadow: -2px 4px 12px color-mix(in srgb, var(--bd-primary) 30%, transparent);
      z-index: 999999;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: bd-pullTabSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .bd-pull-tab:hover {
      width: 32px;
      box-shadow: -4px 6px 16px color-mix(in srgb, var(--bd-primary) 40%, transparent);
    }

    .bd-pull-tab:active {
      width: 28px;
    }

    .bd-pull-tab-chevron {
      font-size: 16px;
      font-weight: bold;
      transition: transform 0.2s;
    }

    .bd-pull-tab:hover .bd-pull-tab-chevron {
      transform: translateX(-2px);
    }

    /* Pull tab position for bottom-left */
    .bd-pull-tab--left {
      right: auto;
      left: 0;
      border-radius: 0 8px 8px 0;
      box-shadow: 2px 4px 12px color-mix(in srgb, var(--bd-primary) 30%, transparent);
    }

    .bd-pull-tab--left:hover {
      box-shadow: 4px 6px 16px color-mix(in srgb, var(--bd-primary) 40%, transparent);
    }

    .bd-pull-tab--left .bd-pull-tab-chevron {
      transform: rotate(180deg);
    }

    .bd-pull-tab--left:hover .bd-pull-tab-chevron {
      transform: rotate(180deg) translateX(-2px);
    }

    @media (max-width: 640px) {
      .bd-pull-tab {
        bottom: 16px;
        height: 44px;
        width: 22px;
      }

      .bd-pull-tab:hover {
        width: 28px;
      }
    }

    /* Touch devices - always slightly expanded */
    @media (hover: none) {
      .bd-pull-tab {
        width: 28px;
      }
    }

    /* Dismissible close button */
    .bd-trigger-close {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: none;
      background: var(--bd-text-primary);
      color: var(--bd-bg-primary);
      font-size: 14px;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      opacity: 0;
      transform: scale(0.8);
      transition: opacity var(--bd-transition), transform var(--bd-transition);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      box-shadow: var(--bd-shadow-sm);
    }

    .bd-trigger:hover .bd-trigger-close {
      opacity: 1;
      transform: scale(1);
    }

    .bd-trigger-close:hover {
      background: var(--bd-error);
      color: white;
    }

    /* Modal Overlay */
    .bd-overlay {
      position: fixed;
      inset: 0;
      background: var(--bd-overlay-bg);
      z-index: 1000000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: bd-fadeIn 0.2s ease;
    }

    /* Modal */
    .bd-modal {
      background: var(--bd-bg-primary);
      border-radius: var(--bd-radius-lg);
      border: var(--bd-border-style);
      box-shadow: var(--bd-shadow-lg), var(--bd-shadow-glow);
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: bd-slideUp var(--bd-transition-slow);
    }

    /* Modal Header */
    .bd-header {
      padding: 16px 20px;
      border-bottom: var(--bd-border-style);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--bd-bg-primary);
      animation: bd-fadeIn 0.2s ease 0.05s both;
    }

    .bd-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--bd-text-primary);
    }

    .bd-close {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: var(--bd-radius-sm);
      font-size: 24px;
      cursor: pointer;
      color: var(--bd-text-secondary);
      padding: 0;
      line-height: 1;
      transition: background var(--bd-transition), color var(--bd-transition);
    }

    .bd-close:hover {
      background: var(--bd-bg-secondary);
      color: var(--bd-text-primary);
    }

    /* Modal Body with staggered animation */
    .bd-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    }

    .bd-body > *:nth-child(1) { animation: bd-fadeIn 0.2s ease 0.1s both; }
    .bd-body > *:nth-child(2) { animation: bd-fadeIn 0.2s ease 0.15s both; }
    .bd-body > *:nth-child(3) { animation: bd-fadeIn 0.2s ease 0.2s both; }
    .bd-body > *:nth-child(4) { animation: bd-fadeIn 0.2s ease 0.25s both; }
    .bd-body > *:nth-child(5) { animation: bd-fadeIn 0.2s ease 0.3s both; }

    .bd-version {
      text-align: center;
      padding: 4px 0;
      font-size: 0.7rem;
      color: var(--bd-text-secondary);
      opacity: 0.5;
    }

    /* Form Elements */
    .bd-form-group {
      margin-bottom: 16px;
    }

    .bd-label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      font-size: 13px;
      color: var(--bd-text-secondary);
      letter-spacing: 0.01em;
    }

    .bd-input, .bd-textarea {
      width: 100%;
      padding: 12px 14px;
      background: var(--bd-bg-primary);
      border: var(--bd-border-style);
      border-radius: var(--bd-radius-sm);
      font-size: 14px;
      color: var(--bd-text-primary);
      transition: border-color var(--bd-transition), box-shadow var(--bd-transition);
    }

    .bd-input::placeholder, .bd-textarea::placeholder {
      color: var(--bd-text-muted);
    }

    .bd-input:focus, .bd-textarea:focus {
      outline: none;
      border-color: var(--bd-border-focus);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--bd-border-focus) 15%, transparent);
    }

    .bd-textarea {
      min-height: 100px;
      resize: vertical;
    }

    /* Buttons */
    .bd-btn {
      padding: 11px 20px;
      border-radius: var(--bd-radius-sm);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--bd-transition);
      position: relative;
    }

    .bd-btn-primary {
      background: var(--bd-primary);
      color: var(--bd-primary-text);
      border: none;
      box-shadow: var(--bd-shadow-sm);
    }

    .bd-btn-primary:hover {
      background: var(--bd-primary-hover);
      box-shadow: var(--bd-shadow-md);
    }

    .bd-dark .bd-btn-primary:hover {
      box-shadow: var(--bd-shadow-md), 0 0 20px rgba(34, 211, 238, 0.2);
    }

    .bd-btn-secondary {
      background: var(--bd-bg-primary);
      border: var(--bd-border-style);
      color: var(--bd-text-primary);
    }

    .bd-btn-secondary:hover {
      background: var(--bd-bg-secondary);
    }

    .bd-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Loading States */
    .bd-btn--loading {
      color: transparent !important;
      pointer-events: none;
    }

    .bd-btn--loading::after {
      content: '';
      position: absolute;
      width: 16px;
      height: 16px;
      top: 50%;
      left: 50%;
      margin: -8px 0 0 -8px;
      border: 2px solid currentColor;
      border-color: var(--bd-primary-text) transparent var(--bd-primary-text) transparent;
      border-radius: 50%;
      animation: bd-spin 0.8s linear infinite;
    }

    .bd-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--bd-border);
      border-top-color: var(--bd-primary);
      border-radius: 50%;
      animation: bd-spin 0.8s linear infinite;
    }

    .bd-spinner--lg {
      width: 32px;
      height: 32px;
      border-width: 3px;
    }

    .bd-loading-overlay {
      position: absolute;
      inset: 0;
      background: var(--bd-bg-primary);
      opacity: 0.95;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      z-index: 10;
      border-radius: var(--bd-radius-lg);
    }

    .bd-loading-text {
      font-size: 14px;
      color: var(--bd-text-secondary);
      font-weight: 500;
    }

    .bd-skeleton {
      background: linear-gradient(
        90deg,
        var(--bd-bg-secondary) 0%,
        var(--bd-bg-tertiary) 50%,
        var(--bd-bg-secondary) 100%
      );
      background-size: 200% 100%;
      animation: bd-shimmer 1.5s ease-in-out infinite;
      border-radius: var(--bd-radius-sm);
    }

    /* Error States */
    .bd-error-message {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: var(--bd-radius-sm);
      color: var(--bd-error);
      font-size: 13px;
      margin-bottom: 16px;
    }

    .bd-dark .bd-error-message {
      background: rgba(248, 113, 113, 0.1);
      border-color: rgba(248, 113, 113, 0.2);
    }

    .bd-error-message__icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
    }

    .bd-error-message__text {
      flex: 1;
      line-height: 1.4;
    }

    .bd-error-message__retry {
      background: none;
      border: none;
      color: inherit;
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
      padding: 0;
      font-size: 13px;
    }

    .bd-input--error, .bd-textarea--error {
      border-color: var(--bd-error) !important;
    }

    /* Success Modal */
    .bd-success-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 8px 0 16px;
    }

    .bd-success-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--bd-success);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
    }

    .bd-success-icon svg {
      width: 28px;
      height: 28px;
      color: white;
    }

    .bd-success-issue {
      margin: 0 0 12px;
      color: var(--bd-text-primary);
      font-size: 15px;
    }

    .bd-issue-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--bd-primary);
      text-decoration: none;
      font-weight: 500;
      font-size: 14px;
      padding: 8px 16px;
      border-radius: var(--bd-radius-sm);
      background: var(--bd-bg-secondary);
      transition: background var(--bd-transition), color var(--bd-transition);
    }

    .bd-issue-link:hover {
      background: var(--bd-bg-tertiary);
      color: var(--bd-primary-hover);
    }

    .bd-issue-link svg {
      flex-shrink: 0;
    }

    .bd-powered-by {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--bd-border);
      text-align: center;
    }

    .bd-powered-by a {
      color: var(--bd-text-secondary);
      text-decoration: none;
      font-size: 12px;
      transition: color var(--bd-transition);
    }

    .bd-powered-by a:hover {
      color: var(--bd-text-primary);
    }

    .bd-input--error:focus, .bd-textarea--error:focus {
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15) !important;
    }

    .bd-field-error {
      color: var(--bd-error);
      font-size: 12px;
      margin-top: 4px;
    }

    /* Actions */
    .bd-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 20px;
    }

    /* Tools Toolbar */
    .bd-tools {
      display: flex;
      gap: 6px;
      padding: 8px;
      background: var(--bd-bg-secondary);
      border: var(--bd-border-style);
      border-radius: var(--bd-radius-md);
      margin-bottom: 12px;
    }

    .bd-tool {
      padding: 8px 14px;
      background: transparent;
      border: none;
      border-radius: var(--bd-radius-sm);
      font-size: 13px;
      font-weight: 500;
      color: var(--bd-text-secondary);
      cursor: pointer;
      transition: all var(--bd-transition);
    }

    .bd-tool:hover {
      background: var(--bd-bg-tertiary);
      color: var(--bd-text-primary);
    }

    .bd-tool.active {
      background: var(--bd-bg-primary);
      color: var(--bd-primary);
      box-shadow: var(--bd-shadow-sm);
    }

    /* Preview */
    .bd-preview {
      border: var(--bd-border-style);
      border-radius: var(--bd-radius-md);
      overflow: hidden;
      margin-bottom: 16px;
      box-shadow: var(--bd-shadow-sm);
    }

    .bd-preview img {
      width: 100%;
      display: block;
    }

    /* Toast Notifications */
    .bd-toast {
      position: fixed;
      bottom: 100px;
      right: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 18px;
      border-radius: var(--bd-radius-md);
      color: white;
      font-size: 14px;
      font-weight: 500;
      z-index: 1000001;
      box-shadow: var(--bd-shadow-lg);
      animation: bd-slideIn 0.3s ease;
    }

    .bd-toast.success {
      background: var(--bd-success);
    }

    .bd-toast.error {
      background: var(--bd-error);
    }

    /* Animations */
    @keyframes bd-fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes bd-slideUp {
      from { opacity: 0; transform: translateY(24px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes bd-slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    @keyframes bd-pullTabSlideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    /* Directional animations for dismiss/restore */
    @keyframes bd-triggerSlideInFromRight {
      from {
        opacity: 0;
        transform: translateX(100px) scale(0.8);
      }
      to {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
    }

    @keyframes bd-triggerSlideOutToRight {
      from {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
      to {
        opacity: 0;
        transform: translateX(100px) scale(0.8);
      }
    }

    .bd-trigger--dismissing {
      animation: bd-triggerSlideOutToRight 0.3s cubic-bezier(0.4, 0, 1, 1) forwards;
    }

    .bd-trigger--restoring {
      animation: bd-triggerSlideInFromRight 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes bd-spin {
      to { transform: rotate(360deg); }
    }

    @keyframes bd-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Mobile Responsiveness */
    @media (max-width: 640px) {
      .bd-trigger {
        height: 40px;
        padding: 0 14px;
        bottom: 16px;
        gap: 6px;
      }

      .bd-trigger-icon {
        font-size: 16px;
      }

      .bd-trigger-icon img {
        width: 16px;
        height: 16px;
      }

      .bd-trigger-label {
        font-size: 13px;
      }

      .bd-overlay {
        align-items: flex-end;
      }

      .bd-modal {
        width: 100%;
        max-width: 100%;
        max-height: 95vh;
        border-radius: var(--bd-radius-lg) var(--bd-radius-lg) 0 0;
        animation: bd-slideUpMobile var(--bd-transition-slow);
      }

      .bd-header {
        padding: 16px;
        position: sticky;
        top: 0;
        z-index: 1;
      }

      .bd-close {
        width: 44px;
        height: 44px;
        font-size: 28px;
      }

      .bd-body {
        padding: 16px;
        padding-bottom: 32px;
      }

      .bd-btn {
        padding: 14px 24px;
        font-size: 16px;
        min-height: 48px;
      }

      .bd-input, .bd-textarea {
        padding: 14px;
        font-size: 16px;
        min-height: 48px;
      }

      .bd-textarea {
        min-height: 120px;
      }

      .bd-actions {
        flex-direction: column-reverse;
        gap: 8px;
      }

      .bd-actions .bd-btn {
        width: 100%;
      }

      .bd-tools {
        flex-wrap: wrap;
      }

      .bd-tool {
        flex: 1;
        min-width: calc(50% - 4px);
        justify-content: center;
        padding: 12px;
        text-align: center;
      }

      .bd-toast {
        left: 16px;
        right: 16px;
        bottom: 80px;
        justify-content: center;
      }
    }

    @keyframes bd-slideUpMobile {
      from { opacity: 0; transform: translateY(100%); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Touch-friendly hover states */
    @media (hover: none) {
      .bd-trigger:hover {
        transform: none;
        box-shadow: var(--bd-shadow-md);
      }

      .bd-trigger:active {
        transform: scale(0.97);
      }

      /* Always show close button on touch devices */
      .bd-trigger-close {
        opacity: 1;
        transform: scale(1);
      }

      .bd-btn:hover {
        background: inherit;
      }

      .bd-btn-primary:hover {
        background: var(--bd-primary);
      }

      .bd-btn-primary:active {
        background: var(--bd-primary-hover);
      }

      .bd-btn-secondary:hover {
        background: var(--bd-bg-primary);
      }

      .bd-btn-secondary:active {
        background: var(--bd-bg-secondary);
      }
    }

    /* Safe area support for notched devices */
    @supports (padding-bottom: env(safe-area-inset-bottom)) {
      .bd-modal {
        padding-bottom: env(safe-area-inset-bottom);
      }
    }

    /* Reduced motion preference */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  `;

  shadow.appendChild(styles);

  // Create root wrapper with theme class
  const root = document.createElement('div');
  root.className = `bd-root${isDark ? ' bd-dark' : ''}`;

  // Apply custom accent color if provided
  if (config.accentColor) {
    const color = config.accentColor;
    // Generate a slightly darker hover color by mixing with black
    root.style.setProperty('--bd-primary', color);
    root.style.setProperty('--bd-primary-hover', `color-mix(in srgb, ${color} 85%, black)`);
    root.style.setProperty('--bd-border-focus', color);
  }

  // Apply custom background color if provided
  if (config.bgColor) {
    root.style.setProperty('--bd-bg-primary', config.bgColor);
    // Generate secondary/tertiary bg variants by mixing with black (light) or white (dark)
    if (isDark) {
      root.style.setProperty(
        '--bd-bg-secondary',
        `color-mix(in srgb, ${config.bgColor} 85%, white)`
      );
      root.style.setProperty(
        '--bd-bg-tertiary',
        `color-mix(in srgb, ${config.bgColor} 70%, white)`
      );
    } else {
      root.style.setProperty(
        '--bd-bg-secondary',
        `color-mix(in srgb, ${config.bgColor} 93%, black)`
      );
      root.style.setProperty(
        '--bd-bg-tertiary',
        `color-mix(in srgb, ${config.bgColor} 85%, black)`
      );
    }
  }

  // Apply custom text color if provided
  if (config.textColor) {
    root.style.setProperty('--bd-text-primary', config.textColor);
    // Generate secondary/muted text variants by mixing with the background
    const bgBase = config.bgColor || (isDark ? '#0f172a' : '#fafaf9');
    root.style.setProperty(
      '--bd-text-secondary',
      `color-mix(in srgb, ${config.textColor} 65%, ${bgBase})`
    );
    root.style.setProperty(
      '--bd-text-muted',
      `color-mix(in srgb, ${config.textColor} 40%, ${bgBase})`
    );
  }

  // Apply custom border styling if provided
  if (borderW !== null || borderC !== null) {
    const bw = borderW !== null ? `${borderW}px` : '1px';
    const bc = borderC || 'var(--bd-border)';
    root.style.setProperty('--bd-border', bc);
    root.style.setProperty('--bd-border-style', `${bw} solid ${bc}`);
  }

  // Apply shadow preset if provided
  if (shadowPreset === 'none') {
    root.style.setProperty('--bd-shadow-sm', 'none');
    root.style.setProperty('--bd-shadow-md', 'none');
    root.style.setProperty('--bd-shadow-lg', 'none');
    root.style.setProperty('--bd-shadow-glow', 'none');
  } else if (shadowPreset === 'hard') {
    const shadowColor = borderC || (isDark ? '#000' : '#1a1a1a');
    const offset = borderW !== null ? `${borderW + 2}px` : '6px';
    root.style.setProperty('--bd-shadow-sm', `${shadowColor} 2px 2px 0 0`);
    root.style.setProperty('--bd-shadow-md', `${shadowColor} ${offset} ${offset} 0 0`);
    root.style.setProperty('--bd-shadow-lg', `${shadowColor} ${offset} ${offset} 0 0`);
    root.style.setProperty('--bd-shadow-glow', 'none');
  }

  shadow.appendChild(root);

  return root;
}

export function createModal(container: HTMLElement, title: string, content: string): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'bd-overlay';
  const widgetVersion = typeof __BUGDROP_VERSION__ !== 'undefined' ? __BUGDROP_VERSION__ : 'dev';
  overlay.innerHTML = `
    <div class="bd-modal">
      <div class="bd-header">
        <h2 class="bd-title">${title}</h2>
        <button class="bd-close">&times;</button>
      </div>
      <div class="bd-body">
        ${content}
      </div>
      <div class="bd-version">BugDrop v${widgetVersion}</div>
    </div>
  `;

  container.appendChild(overlay);
  return overlay;
}

export function showSuccessModal(
  container: HTMLElement,
  issueNumber: number,
  issueUrl: string,
  isPublic: boolean
): Promise<void> {
  return new Promise(resolve => {
    const issueInfo = isPublic
      ? `
        <p class="bd-success-issue">Issue <strong>#${issueNumber}</strong> has been created.</p>
        <a href="${issueUrl}" target="_blank" rel="noopener noreferrer" class="bd-issue-link">
          <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/>
          </svg>
          View on GitHub
        </a>
      `
      : `<p class="bd-success-issue">Your feedback has been submitted successfully.</p>`;

    const modal = createModal(
      container,
      'Feedback Submitted!',
      `
        <div class="bd-success-content">
          <div class="bd-success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          ${issueInfo}
        </div>
        <div class="bd-actions">
          <button class="bd-btn bd-btn-primary" data-action="done">Done</button>
        </div>
        <div class="bd-powered-by">
          <a href="https://github.com/neonwatty/bugdrop" target="_blank" rel="noopener noreferrer">Powered by BugDrop</a>
        </div>
      `
    );

    const closeBtn = modal.querySelector('.bd-close') as HTMLElement;
    const doneBtn = modal.querySelector('[data-action="done"]') as HTMLElement;

    const closeModal = () => {
      modal.remove();
      resolve();
    };

    closeBtn?.addEventListener('click', closeModal);
    doneBtn?.addEventListener('click', closeModal);
  });
}
