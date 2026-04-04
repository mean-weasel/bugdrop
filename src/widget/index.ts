import { captureScreenshot } from './screenshot';
import { createElementPicker } from './picker';
import { createAnnotator } from './annotator';
import { injectStyles, createModal, showSuccessModal } from './ui';

interface WidgetConfig {
  repo: string;
  apiUrl: string;
  position: 'bottom-right' | 'bottom-left';
  theme: 'light' | 'dark' | 'auto';
  // Name/email field configuration
  showName: boolean;
  requireName: boolean;
  showEmail: boolean;
  requireEmail: boolean;
  // Dismissible button configuration
  buttonDismissible: boolean;
  dismissDuration?: number; // Days before dismissed button reappears (undefined = forever)
  showRestore: boolean; // Show a pull tab after dismissing (default true when dismissible)
  // Button visibility (false = API-only mode)
  showButton: boolean;
  // Custom accent color (hex)
  accentColor?: string;
  // Custom icon URL (replaces default bug emoji), or 'none' to hide the icon
  iconUrl?: string;
  // Custom trigger button label text (default: 'Feedback')
  label?: string;
  // Tier 1 styling customization
  font?: string; // 'inherit' to use host page font, or a custom font-family string
  radius?: string; // Border radius in px (e.g., '0', '8', '16')
  bgColor?: string; // Background color override (e.g., '#fffef0')
  textColor?: string; // Text color override (e.g., '#1a1a1a')
  // Tier 2 styling customization
  borderWidth?: string; // Border width in px (e.g., '4')
  borderColor?: string; // Border color (e.g., '#1a1a1a')
  shadow?: string; // Shadow preset: 'none', 'soft' (default), 'hard'
  // Welcome screen behavior
  welcome: 'once' | 'always' | 'never';
}

// BugDrop JavaScript API interface
interface BugDropAPI {
  open: () => void;
  close: () => void;
  hide: () => void;
  show: () => void;
  isOpen: () => boolean;
  isButtonVisible: () => boolean;
}

// Declare global BugDrop API
declare global {
  interface Window {
    BugDrop?: BugDropAPI;
  }
}

interface FeedbackData {
  title: string;
  description: string;
  category: FeedbackCategory;
  screenshot: string | null;
  elementSelector: string | null;
  name?: string;
  email?: string;
}

// localStorage key for dismissed state
const BUGDROP_DISMISSED_KEY = 'bugdrop_dismissed';
const BUGDROP_WELCOMED_PREFIX = 'bugdrop_welcomed_';

// Parse user agent to extract browser info
function parseBrowser(ua: string): { name: string; version: string } {
  // Order matters - check more specific patterns first
  const browsers: Array<{ name: string; pattern: RegExp }> = [
    { name: 'Edge', pattern: /Edg(?:e|A|iOS)?\/(\d+[\d.]*)/ },
    { name: 'Opera', pattern: /(?:OPR|Opera)\/(\d+[\d.]*)/ },
    { name: 'Chrome', pattern: /Chrome\/(\d+[\d.]*)/ },
    { name: 'Safari', pattern: /Version\/(\d+[\d.]*).*Safari/ },
    { name: 'Firefox', pattern: /Firefox\/(\d+[\d.]*)/ },
  ];

  for (const { name, pattern } of browsers) {
    const match = ua.match(pattern);
    if (match) {
      return { name, version: match[1] || 'unknown' };
    }
  }

  return { name: 'Unknown', version: 'unknown' };
}

// Parse user agent to extract OS info
function parseOS(ua: string): { name: string; version: string } {
  const osPatterns: Array<{ name: string; pattern: RegExp; versionIndex?: number }> = [
    { name: 'iOS', pattern: /iPhone OS (\d+[_\d]*)/, versionIndex: 1 },
    { name: 'iOS', pattern: /iPad.*OS (\d+[_\d]*)/, versionIndex: 1 },
    { name: 'macOS', pattern: /Mac OS X (\d+[_.\d]*)/, versionIndex: 1 },
    { name: 'Windows', pattern: /Windows NT (\d+\.\d+)/, versionIndex: 1 },
    { name: 'Android', pattern: /Android (\d+[\d.]*)/, versionIndex: 1 },
    { name: 'Linux', pattern: /Linux/, versionIndex: undefined },
    { name: 'Chrome OS', pattern: /CrOS/, versionIndex: undefined },
  ];

  for (const { name, pattern, versionIndex } of osPatterns) {
    const match = ua.match(pattern);
    if (match) {
      const version =
        versionIndex !== undefined && match[versionIndex]
          ? match[versionIndex].replace(/_/g, '.')
          : '';
      return { name, version };
    }
  }

  return { name: 'Unknown', version: '' };
}

// Redact sensitive parts of URL (query params, common ID patterns)
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove query string and hash
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    // If URL parsing fails, return as-is but try to strip query params
    return url.split('?')[0].split('#')[0];
  }
}

// Collect system info for feedback submission
function getSystemInfo(): {
  browser: { name: string; version: string };
  os: { name: string; version: string };
  devicePixelRatio: number;
  language: string;
  url: string;
} {
  const ua = navigator.userAgent;
  return {
    browser: parseBrowser(ua),
    os: parseOS(ua),
    devicePixelRatio: window.devicePixelRatio || 1,
    language: navigator.language || 'unknown',
    url: redactUrl(window.location.href),
  };
}

// Store widget state for API access
let _widgetRoot: HTMLElement | null = null;
let _triggerButton: HTMLElement | null = null;
let _pullTab: HTMLElement | null = null;
let _isModalOpen = false;
let _widgetConfig: WidgetConfig | null = null;

// Helper to check if button was dismissed
function isButtonDismissed(dismissDuration?: number): boolean {
  try {
    const dismissedAt = localStorage.getItem(BUGDROP_DISMISSED_KEY);
    if (!dismissedAt) return false;

    // Legacy support: if stored value is 'true', treat as permanently dismissed
    if (dismissedAt === 'true') return true;

    const timestamp = parseInt(dismissedAt, 10);
    if (isNaN(timestamp)) return false;

    // If no duration set, dismissed forever
    if (dismissDuration === undefined) return true;

    // Check if duration has passed (duration is in days)
    const durationMs = dismissDuration * 24 * 60 * 60 * 1000;
    return Date.now() - timestamp < durationMs;
  } catch {
    // localStorage may be blocked in some contexts
    return false;
  }
}

// Helper to dismiss the button
function dismissButton(): void {
  try {
    localStorage.setItem(BUGDROP_DISMISSED_KEY, Date.now().toString());
  } catch {
    // localStorage may be blocked in some contexts
  }
}

function hasSeenWelcome(repo: string): boolean {
  try {
    return localStorage.getItem(BUGDROP_WELCOMED_PREFIX + repo) !== null;
  } catch {
    return false;
  }
}

function markWelcomeSeen(repo: string): void {
  try {
    localStorage.setItem(BUGDROP_WELCOMED_PREFIX + repo, Date.now().toString());
  } catch {
    // localStorage may be blocked
  }
}

// Read config from script tag (fallback to src-based lookup for async/defer)
const script = (document.currentScript ||
  document.querySelector('script[src*="bugdrop"][src*="widget"]')) as HTMLScriptElement;
if (!document.currentScript) {
  console.warn(
    '[BugDrop] document.currentScript is null — do not use async or defer on the BugDrop script tag.'
  );
}
const rawTheme = script?.dataset.theme as WidgetConfig['theme'] | undefined;
const config: WidgetConfig = {
  repo: script?.dataset.repo || '',
  apiUrl: script?.src.replace(/\/widget(?:\.v[\d.]+)?\.js$/, '/api') || '',
  position: (script?.dataset.position as WidgetConfig['position']) || 'bottom-right',
  theme: rawTheme || 'auto', // Default to auto-detection
  // Name/email field configuration (all default to false for backwards compatibility)
  showName: script?.dataset.showName === 'true',
  requireName: script?.dataset.requireName === 'true',
  showEmail: script?.dataset.showEmail === 'true',
  requireEmail: script?.dataset.requireEmail === 'true',
  // Dismissible button configuration
  buttonDismissible: script?.dataset.buttonDismissible === 'true',
  dismissDuration: script?.dataset.dismissDuration
    ? parseInt(script.dataset.dismissDuration, 10)
    : undefined,
  // Show restore pill after dismissing (default true when dismissible, unless explicitly false)
  showRestore: script?.dataset.showRestore !== 'false',
  // Button visibility (default true, set to false for API-only mode)
  showButton: script?.dataset.button !== 'false',
  // Custom accent color (e.g., "#FF6B35")
  accentColor: script?.dataset.color || undefined,
  // Custom icon URL (or 'none' to hide)
  iconUrl: script?.dataset.icon || undefined,
  // Custom trigger label
  label: script?.dataset.label || undefined,
  // Tier 1 styling customization
  font: script?.dataset.font || undefined,
  radius: script?.dataset.radius || undefined,
  bgColor: script?.dataset.bg || undefined,
  textColor: script?.dataset.text || undefined,
  // Tier 2 styling customization
  borderWidth: script?.dataset.borderWidth || undefined,
  borderColor: script?.dataset.borderColor || undefined,
  shadow: script?.dataset.shadow || undefined,
  // Welcome screen behavior (default: 'once')
  welcome: (() => {
    const val = script?.dataset.welcome;
    if (val === 'false' || val === 'never') return 'never' as const;
    if (val === 'always') return 'always' as const;
    return 'once' as const;
  })(),
};

// Validate config
if (!config.repo) {
  console.error('[BugDrop] Missing data-repo attribute');
} else if (!/^[^/]+\/[^/]+$/.test(config.repo)) {
  console.error(
    `[BugDrop] Invalid data-repo format "${config.repo}". Expected "owner/repo" (e.g., "octocat/hello-world").`
  );
} else {
  initWidget(config);
}

// Build the trigger button icon HTML - custom image with emoji fallback, 'none' to hide, or default emoji
function getTriggerIconHtml(config: WidgetConfig): string {
  if (config.iconUrl === 'none') {
    return '';
  }
  if (config.iconUrl) {
    return `<img src="${config.iconUrl}" alt="" onerror="this.style.display='none';this.nextSibling.style.display=''"><span style="display:none">🐛</span>`;
  }
  return '🐛';
}

// Build the trigger button label text
function getTriggerLabel(config: WidgetConfig): string {
  return config.label !== undefined ? config.label : 'Feedback';
}

// Create the pull tab shown after dismissing the button
function createPullTab(root: HTMLElement, config: WidgetConfig): HTMLElement {
  const tab = document.createElement('div');
  tab.className =
    config.position === 'bottom-left' ? 'bd-pull-tab bd-pull-tab--left' : 'bd-pull-tab';
  tab.innerHTML = '<span class="bd-pull-tab-chevron">‹</span>';
  tab.setAttribute('role', 'button');
  tab.setAttribute('tabindex', '0');
  tab.setAttribute('aria-label', 'Show feedback button');

  const handleRestore = () => {
    // Clear dismissed state
    try {
      localStorage.removeItem(BUGDROP_DISMISSED_KEY);
    } catch {
      // localStorage may be blocked
    }

    // Remove the pull tab
    tab.remove();
    _pullTab = null;

    // Recreate the trigger button with restore animation
    createTriggerButton(root, config, true);
  };

  tab.addEventListener('click', handleRestore);
  tab.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleRestore();
    }
  });

  root.appendChild(tab);
  _pullTab = tab;
  return tab;
}

function initWidget(config: WidgetConfig) {
  // Store config for API access
  _widgetConfig = config;

  // If button is not dismissible, clear any stale dismissed state from localStorage
  // This ensures the button shows on non-dismissible pages even after visiting dismissible ones
  if (!config.buttonDismissible) {
    try {
      localStorage.removeItem(BUGDROP_DISMISSED_KEY);
    } catch {
      // localStorage may be blocked
    }
  }

  // Create Shadow DOM for style isolation
  const host = document.createElement('div');
  host.id = 'bugdrop-host';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Inject styles and create root wrapper
  const root = injectStyles(shadow, config);
  _widgetRoot = root;

  // Determine if button should be rendered
  const shouldShowButton =
    config.showButton && !(config.buttonDismissible && isButtonDismissed(config.dismissDuration));

  if (shouldShowButton) {
    const trigger = document.createElement('button');
    trigger.className = 'bd-trigger';
    const iconHtml = getTriggerIconHtml(config);
    trigger.innerHTML = `${iconHtml ? `<span class="bd-trigger-icon">${iconHtml}</span>` : ''}<span class="bd-trigger-label">${getTriggerLabel(config)}</span>`;
    trigger.setAttribute('aria-label', 'Report a bug or send feedback');

    // Add close button if dismissible
    if (config.buttonDismissible) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'bd-trigger-close';
      closeBtn.innerHTML = '×';
      closeBtn.setAttribute('aria-label', 'Dismiss feedback button');
      trigger.appendChild(closeBtn);

      // Handle close button click
      closeBtn.addEventListener('click', e => {
        e.stopPropagation(); // Don't trigger the main button
        dismissButton();

        // Remove restoring class if present (to avoid animation conflicts)
        trigger.classList.remove('bd-trigger--restoring');

        // Add dismiss animation
        trigger.classList.add('bd-trigger--dismissing');

        // Wait for animation to finish before removing
        trigger.addEventListener(
          'animationend',
          () => {
            trigger.remove();
            _triggerButton = null;

            // Show pull tab if enabled
            if (config.showRestore) {
              createPullTab(root, config);
            }
          },
          { once: true }
        );
      });
    }

    root.appendChild(trigger);
    _triggerButton = trigger;

    // Handle trigger click
    trigger.addEventListener('click', () => openFeedbackFlow(root, config));
  } else if (
    config.showButton &&
    config.buttonDismissible &&
    config.showRestore &&
    isButtonDismissed(config.dismissDuration)
  ) {
    // Button was previously dismissed - show pull tab
    createPullTab(root, config);
  }

  // Expose the BugDrop API
  exposeBugDropAPI(root, config);

  // Dispatch ready event
  window.dispatchEvent(new CustomEvent('bugdrop:ready'));
}

// Create and expose the BugDrop JavaScript API
function exposeBugDropAPI(root: HTMLElement, config: WidgetConfig) {
  window.BugDrop = {
    // Open the feedback modal programmatically
    open: () => {
      if (!_isModalOpen) {
        openFeedbackFlow(root, config, { skipWelcome: true });
      }
    },

    // Close the current modal
    close: () => {
      if (_isModalOpen) {
        // Find and remove any open modal
        const modal = root.querySelector('.bd-modal');
        if (modal) {
          modal.remove();
        }
        _isModalOpen = false;
      }
    },

    // Hide the floating button
    hide: () => {
      if (_triggerButton) {
        _triggerButton.style.display = 'none';
      }
    },

    // Show the floating button (clears dismissed state when called)
    show: () => {
      // Clear dismissed state when explicitly called
      try {
        localStorage.removeItem(BUGDROP_DISMISSED_KEY);
      } catch {
        // localStorage may be blocked
      }

      // Remove pull tab if present
      if (_pullTab) {
        _pullTab.remove();
        _pullTab = null;
      }

      if (_triggerButton) {
        _triggerButton.style.display = '';
      } else if (config.showButton) {
        // Recreate button if it was removed
        createTriggerButton(root, config);
      }
    },

    // Check if modal is currently open
    isOpen: () => _isModalOpen,

    // Check if floating button is visible
    isButtonVisible: () => {
      return _triggerButton !== null && _triggerButton.style.display !== 'none';
    },
  };
}

// Helper to create the trigger button (used by show() API and pull tab restore)
function createTriggerButton(root: HTMLElement, config: WidgetConfig, isRestoring = false) {
  const trigger = document.createElement('button');
  trigger.className = isRestoring ? 'bd-trigger bd-trigger--restoring' : 'bd-trigger';
  const iconHtml = getTriggerIconHtml(config);
  trigger.innerHTML = `${iconHtml ? `<span class="bd-trigger-icon">${iconHtml}</span>` : ''}<span class="bd-trigger-label">${getTriggerLabel(config)}</span>`;
  trigger.setAttribute('aria-label', 'Report a bug or send feedback');

  if (config.buttonDismissible) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'bd-trigger-close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Dismiss feedback button');
    trigger.appendChild(closeBtn);

    closeBtn.addEventListener('click', e => {
      e.stopPropagation();
      dismissButton();

      // Remove restoring class if present (to avoid animation conflicts)
      trigger.classList.remove('bd-trigger--restoring');

      // Add dismiss animation
      trigger.classList.add('bd-trigger--dismissing');

      // Wait for animation to finish before removing
      trigger.addEventListener(
        'animationend',
        () => {
          trigger.remove();
          _triggerButton = null;

          // Show pull tab if enabled
          if (config.showRestore) {
            createPullTab(root, config);
          }
        },
        { once: true }
      );
    });
  }

  root.appendChild(trigger);
  _triggerButton = trigger;

  trigger.addEventListener('click', () => openFeedbackFlow(root, config));
}

async function openFeedbackFlow(
  root: HTMLElement,
  config: WidgetConfig,
  opts?: { skipWelcome?: boolean }
) {
  // Mark modal as open
  _isModalOpen = true;

  // Check if app is installed
  const installStatus = await checkInstallation(config);
  if (installStatus === 'not_installed') {
    showInstallPrompt(root, config);
    return;
  }
  if (installStatus === 'unreachable') {
    showInstallPrompt(
      root,
      config,
      'Unable to reach BugDrop API. Check your network connection or script tag URL.'
    );
    return;
  }

  // Step 1: Welcome screen (conditional)
  const skipWelcome =
    opts?.skipWelcome ||
    config.welcome === 'never' ||
    (config.welcome === 'once' && hasSeenWelcome(config.repo));

  if (!skipWelcome) {
    const continueFlow = await showWelcomeScreen(root);
    if (!continueFlow) {
      _isModalOpen = false;
      return;
    }
    if (config.welcome === 'once') {
      markWelcomeSeen(config.repo);
    }
  }

  // Step 2: Feedback form (with optional screenshot checkbox)
  const formResult = await showFeedbackFormWithScreenshotOption(root, config);
  if (!formResult) {
    // User cancelled
    _isModalOpen = false;
    return;
  }

  let screenshot: string | null = null;
  let elementSelector: string | null = null;

  // Step 3: Screenshot flow (if user opted in)
  if (formResult.includeScreenshot) {
    const screenshotChoice = await showScreenshotOptions(root);

    if (screenshotChoice === 'capture') {
      screenshot = await captureWithLoading(root);
    } else if (screenshotChoice === 'element') {
      const element = await createElementPicker({
        accentColor: config.accentColor,
        font: config.font,
        radius: config.radius,
        borderWidth: config.borderWidth,
        bgColor: config.bgColor,
        textColor: config.textColor,
        borderColor: config.borderColor,
        theme: config.theme,
      });
      if (element) {
        screenshot = await captureWithLoading(root, element);
        elementSelector = getElementSelector(element);
      }
    }

    // Step 4: Annotate (if screenshot exists)
    if (screenshot) {
      screenshot = await showAnnotationStep(root, screenshot, config);
    }
  }

  // Submit
  await submitFeedback(root, config, {
    title: formResult.title,
    description: formResult.description,
    category: formResult.category,
    name: formResult.name,
    email: formResult.email,
    screenshot,
    elementSelector,
  });

  // Flow complete
  _isModalOpen = false;
}

async function captureWithLoading(root: HTMLElement, element?: Element): Promise<string | null> {
  // Show a temporary loading indicator
  const loadingModal = createModal(
    root,
    'Capturing...',
    `
      <div style="display: flex; flex-direction: column; align-items: center; padding: 20px;">
        <div class="bd-spinner bd-spinner--lg"></div>
        <p class="bd-loading-text" style="margin-top: 12px;">Capturing screenshot...</p>
      </div>
    `
  );

  try {
    const screenshot = await captureScreenshot(element);
    loadingModal.remove();
    return screenshot;
  } catch (_error) {
    loadingModal.remove();

    // Show error with retry option
    return new Promise(resolve => {
      const errorModal = createModal(
        root,
        'Capture Failed',
        `
          <div class="bd-error-message">
            <svg class="bd-error-message__icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-9.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5.5zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
            </svg>
            <span class="bd-error-message__text">Failed to capture screenshot. This might be due to browser restrictions.</span>
          </div>
          <div class="bd-actions">
            <button class="bd-btn bd-btn-secondary" data-action="skip">Skip Screenshot</button>
            <button class="bd-btn bd-btn-primary" data-action="retry">Try Again</button>
          </div>
        `
      );

      const closeBtn = errorModal.querySelector('.bd-close') as HTMLElement;
      const skipBtn = errorModal.querySelector('[data-action="skip"]') as HTMLElement;
      const retryBtn = errorModal.querySelector('[data-action="retry"]') as HTMLElement;

      closeBtn?.addEventListener('click', () => {
        errorModal.remove();
        resolve(null);
      });

      skipBtn?.addEventListener('click', () => {
        errorModal.remove();
        resolve(null);
      });

      retryBtn?.addEventListener('click', async () => {
        errorModal.remove();
        const result = await captureWithLoading(root, element);
        resolve(result);
      });
    });
  }
}

async function checkInstallation(
  config: WidgetConfig
): Promise<'installed' | 'not_installed' | 'unreachable'> {
  try {
    const response = await fetch(`${config.apiUrl}/check/${config.repo}`);
    if (!response.ok) return 'unreachable';
    const data = await response.json();
    return data.installed === true ? 'installed' : 'not_installed';
  } catch {
    return 'unreachable';
  }
}

function showInstallPrompt(root: HTMLElement, config: WidgetConfig, errorMessage?: string) {
  const appName = config.apiUrl.includes('bugdrop.neonwatty.workers.dev')
    ? 'neonwatty-bugdrop'
    : config.apiUrl.replace(/https?:\/\//, '').replace(/\..*/, '');
  const installUrl = `https://github.com/apps/${appName}/installations/new`;
  const message = errorMessage || 'BugDrop requires GitHub App installation to create issues.';
  const title = errorMessage ? 'Connection Error' : 'Install Required';
  const modal = createModal(
    root,
    title,
    `
      <p style="margin: 0 0 16px; color: var(--bd-text-secondary);">${message}</p>
      <div class="bd-actions">
        <button class="bd-btn bd-btn-secondary" data-action="cancel">Cancel</button>
        ${!errorMessage ? `<a href="${installUrl}" target="_blank" class="bd-btn bd-btn-primary" style="text-decoration: none;">Install App</a>` : ''}
      </div>
    `
  );

  const closeBtn = modal.querySelector('.bd-close') as HTMLElement;
  const cancelBtn = modal.querySelector('[data-action="cancel"]') as HTMLElement;

  closeBtn?.addEventListener('click', () => {
    modal.remove();
    _isModalOpen = false;
  });
  cancelBtn?.addEventListener('click', () => {
    modal.remove();
    _isModalOpen = false;
  });
}

function showWelcomeScreen(root: HTMLElement): Promise<boolean> {
  return new Promise(resolve => {
    const modal = createModal(
      root,
      'Share Your Feedback',
      `
        <div style="text-align: center; padding: 8px 0 16px;">
          <div style="font-size: 3rem; margin-bottom: 12px;">💬</div>
          <p style="margin: 0 0 12px; color: var(--bd-text-primary); font-size: 1.05rem; font-weight: 500;">
            Help us improve by sharing your thoughts
          </p>
          <p style="margin: 0 0 8px; color: var(--bd-text-secondary); font-size: 0.95rem; line-height: 1.6;">
            Report bugs, suggest features, or leave feedback.<br/>
            You can optionally include annotated screenshots.
          </p>
        </div>
        <div class="bd-actions" style="justify-content: center;">
          <button class="bd-btn bd-btn-primary" data-action="continue">Get Started</button>
        </div>
      `
    );

    const closeBtn = modal.querySelector('.bd-close') as HTMLElement;
    const continueBtn = modal.querySelector('[data-action="continue"]') as HTMLElement;

    closeBtn?.addEventListener('click', () => {
      modal.remove();
      resolve(false);
    });

    continueBtn?.addEventListener('click', () => {
      modal.remove();
      resolve(true);
    });
  });
}

type FeedbackCategory = 'bug' | 'feature' | 'question';

interface FeedbackFormResult {
  title: string;
  description: string;
  category: FeedbackCategory;
  name?: string;
  email?: string;
  includeScreenshot: boolean;
}

function showFeedbackFormWithScreenshotOption(
  root: HTMLElement,
  config: WidgetConfig
): Promise<FeedbackFormResult | null> {
  return new Promise(resolve => {
    // Build optional name field
    const nameFieldHtml = config.showName
      ? `
          <div class="bd-form-group">
            <label class="bd-label" for="name">Name${config.requireName ? ' *' : ''}</label>
            <input type="text" id="name" class="bd-input" ${config.requireName ? 'required' : ''} placeholder="Your name" />
          </div>
        `
      : '';

    // Build optional email field
    const emailFieldHtml = config.showEmail
      ? `
          <div class="bd-form-group">
            <label class="bd-label" for="email">Email${config.requireEmail ? ' *' : ''}</label>
            <input type="email" id="email" class="bd-input" ${config.requireEmail ? 'required' : ''} placeholder="your@email.com" />
          </div>
        `
      : '';

    const modal = createModal(
      root,
      'Send Feedback',
      `
        <form id="feedback-form">
          ${nameFieldHtml}
          ${emailFieldHtml}
          <div class="bd-form-group">
            <label class="bd-label" for="title">Title *</label>
            <input type="text" id="title" class="bd-input" required placeholder="Brief description of the issue or suggestion" />
          </div>
          <div class="bd-form-group">
            <label class="bd-label">Category</label>
            <div class="bd-category-selector" style="display: flex; gap: 8px; margin-top: 6px;">
              <label class="bd-category-option" style="flex: 1; display: flex; align-items: center; gap: 6px; padding: 8px 12px; border: var(--bd-border-style); border-radius: var(--bd-radius-sm); cursor: pointer; transition: all 0.15s ease;">
                <input type="radio" name="category" value="bug" checked style="accent-color: var(--bd-primary);" />
                <span style="font-size: 0.9rem;">🐛 Bug</span>
              </label>
              <label class="bd-category-option" style="flex: 1; display: flex; align-items: center; gap: 6px; padding: 8px 12px; border: var(--bd-border-style); border-radius: var(--bd-radius-sm); cursor: pointer; transition: all 0.15s ease;">
                <input type="radio" name="category" value="feature" style="accent-color: var(--bd-primary);" />
                <span style="font-size: 0.9rem;">✨ Feature</span>
              </label>
              <label class="bd-category-option" style="flex: 1; display: flex; align-items: center; gap: 6px; padding: 8px 12px; border: var(--bd-border-style); border-radius: var(--bd-radius-sm); cursor: pointer; transition: all 0.15s ease;">
                <input type="radio" name="category" value="question" style="accent-color: var(--bd-primary);" />
                <span style="font-size: 0.9rem;">❓ Question</span>
              </label>
            </div>
          </div>
          <div class="bd-form-group">
            <label class="bd-label" for="description">Description</label>
            <textarea id="description" class="bd-textarea" placeholder="Provide additional details, steps to reproduce, or context..."></textarea>
          </div>
          <div class="bd-form-group" style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
            <input type="checkbox" id="include-screenshot" checked style="width: 18px; height: 18px; accent-color: var(--bd-primary); cursor: pointer;" />
            <label for="include-screenshot" style="font-size: 0.95rem; color: var(--bd-text-secondary); cursor: pointer; user-select: none;">
              📸 Include a screenshot
            </label>
          </div>
          <div class="bd-actions">
            <button type="button" class="bd-btn bd-btn-secondary" data-action="cancel">Cancel</button>
            <button type="submit" class="bd-btn bd-btn-primary" id="submit-btn">Continue</button>
          </div>
        </form>
      `
    );

    const form = modal.querySelector('#feedback-form') as HTMLFormElement;
    const nameInput = modal.querySelector('#name') as HTMLInputElement | null;
    const emailInput = modal.querySelector('#email') as HTMLInputElement | null;
    const titleInput = modal.querySelector('#title') as HTMLInputElement;
    const descInput = modal.querySelector('#description') as HTMLTextAreaElement;
    const screenshotCheckbox = modal.querySelector('#include-screenshot') as HTMLInputElement;
    const closeBtn = modal.querySelector('.bd-close') as HTMLElement;
    const cancelBtn = modal.querySelector('[data-action="cancel"]') as HTMLElement;

    const closeModal = () => {
      modal.remove();
      resolve(null);
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    form.addEventListener('submit', e => {
      e.preventDefault();

      // Validate required fields
      if (!titleInput.value.trim()) {
        titleInput.classList.add('bd-input--error');
        titleInput.focus();
        return;
      }

      // Validate name if required
      if (config.requireName && nameInput && !nameInput.value.trim()) {
        nameInput.classList.add('bd-input--error');
        nameInput.focus();
        return;
      }

      // Validate email if required
      if (config.requireEmail && emailInput && !emailInput.value.trim()) {
        emailInput.classList.add('bd-input--error');
        emailInput.focus();
        return;
      }

      // Get selected category
      const categoryInput = modal.querySelector(
        'input[name="category"]:checked'
      ) as HTMLInputElement;
      const category = (categoryInput?.value || 'bug') as FeedbackCategory;

      modal.remove();
      resolve({
        title: titleInput.value.trim(),
        description: descInput.value.trim(),
        category,
        name: nameInput?.value.trim() || undefined,
        email: emailInput?.value.trim() || undefined,
        includeScreenshot: screenshotCheckbox.checked,
      });
    });

    // Clear error styling on input
    titleInput.addEventListener('input', () => titleInput.classList.remove('bd-input--error'));
    nameInput?.addEventListener('input', () => nameInput.classList.remove('bd-input--error'));
    emailInput?.addEventListener('input', () => emailInput.classList.remove('bd-input--error'));
  });
}

function showScreenshotOptions(root: HTMLElement): Promise<'skip' | 'capture' | 'element'> {
  return new Promise(resolve => {
    const modal = createModal(
      root,
      'Capture Screenshot',
      `
        <p style="margin: 0 0 16px; color: var(--bd-text-secondary);">Choose what to capture:</p>
        <div class="bd-actions" style="flex-wrap: wrap; gap: 8px;">
          <button class="bd-btn bd-btn-secondary" data-action="skip">Skip Screenshot</button>
          <button class="bd-btn bd-btn-secondary" data-action="element">Select Element</button>
          <button class="bd-btn bd-btn-primary" data-action="capture">Full Page</button>
        </div>
      `
    );

    const closeBtn = modal.querySelector('.bd-close') as HTMLElement;
    const skipBtn = modal.querySelector('[data-action="skip"]') as HTMLElement;
    const elementBtn = modal.querySelector('[data-action="element"]') as HTMLElement;
    const captureBtn = modal.querySelector('[data-action="capture"]') as HTMLElement;

    closeBtn?.addEventListener('click', () => {
      modal.remove();
      resolve('skip');
    });

    skipBtn?.addEventListener('click', () => {
      modal.remove();
      resolve('skip');
    });

    elementBtn?.addEventListener('click', () => {
      modal.remove();
      resolve('element');
    });

    captureBtn?.addEventListener('click', () => {
      modal.remove();
      resolve('capture');
    });
  });
}

function showAnnotationStep(
  root: HTMLElement,
  screenshot: string,
  config?: WidgetConfig
): Promise<string> {
  return new Promise(resolve => {
    const modal = createModal(
      root,
      'Annotate Screenshot',
      `
        <div class="bd-tools">
          <button class="bd-tool active" data-tool="draw">✏️ Draw</button>
          <button class="bd-tool" data-tool="arrow">➡️ Arrow</button>
          <button class="bd-tool" data-tool="rect">▢ Rectangle</button>
          <button class="bd-tool" data-action="undo">↶ Undo</button>
        </div>
        <div id="annotation-canvas"></div>
        <div class="bd-actions">
          <button class="bd-btn bd-btn-secondary" data-action="skip">Skip Annotations</button>
          <button class="bd-btn bd-btn-primary" data-action="done">Done</button>
        </div>
      `
    );

    const canvasContainer = modal.querySelector('#annotation-canvas') as HTMLElement;
    const annotator = createAnnotator(canvasContainer, screenshot, config?.accentColor);

    // Tool buttons
    const toolButtons = modal.querySelectorAll('[data-tool]');
    toolButtons.forEach(btn => {
      btn.addEventListener('click', e => {
        const target = e.target as HTMLElement;
        const tool = target.dataset.tool;

        if (tool === 'undo') {
          annotator.undo();
        } else if (tool) {
          toolButtons.forEach(b => b.classList.remove('active'));
          target.classList.add('active');
          annotator.setTool(tool as any);
        }
      });
    });

    // Action buttons
    const closeBtn = modal.querySelector('.bd-close') as HTMLElement;
    const skipBtn = modal.querySelector('[data-action="skip"]') as HTMLElement;
    const doneBtn = modal.querySelector('[data-action="done"]') as HTMLElement;

    closeBtn?.addEventListener('click', () => {
      annotator.destroy();
      modal.remove();
      resolve(screenshot);
    });

    skipBtn?.addEventListener('click', () => {
      annotator.destroy();
      modal.remove();
      resolve(screenshot);
    });

    doneBtn?.addEventListener('click', () => {
      const annotated = annotator.getImageData();
      annotator.destroy();
      modal.remove();
      resolve(annotated);
    });
  });
}

async function submitFeedback(root: HTMLElement, config: WidgetConfig, data: FeedbackData) {
  // Show submitting modal with loading state
  const modal = createModal(
    root,
    'Submitting...',
    `
      <div style="display: flex; flex-direction: column; align-items: center; padding: 20px;">
        <div class="bd-spinner bd-spinner--lg"></div>
        <p class="bd-loading-text" style="margin-top: 12px;">Creating issue...</p>
      </div>
    `
  );

  try {
    // Build submitter info if provided
    const submitter = data.name || data.email ? { name: data.name, email: data.email } : undefined;

    // Collect system info
    const systemInfo = getSystemInfo();

    const response = await fetch(`${config.apiUrl}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: config.repo,
        title: data.title,
        description: data.description,
        category: data.category,
        screenshot: data.screenshot,
        submitter,
        metadata: {
          url: systemInfo.url, // Redacted URL (no query params)
          userAgent: navigator.userAgent,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          timestamp: new Date().toISOString(),
          elementSelector: data.elementSelector,
          // Parsed system info
          browser: systemInfo.browser,
          os: systemInfo.os,
          devicePixelRatio: systemInfo.devicePixelRatio,
          language: systemInfo.language,
        },
      }),
    });

    modal.remove();

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const minutes = retryAfter ? Math.ceil(parseInt(retryAfter, 10) / 60) : 15;
      showSubmitError(
        root,
        config,
        data,
        `Too many submissions. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
      );
      return;
    }

    const result = await response.json();

    if (result.success) {
      await showSuccessModal(root, result.issueNumber, result.issueUrl, result.isPublic ?? false);
    } else {
      showSubmitError(root, config, data, result.error || 'Failed to submit');
    }
  } catch (_error) {
    modal.remove();
    showSubmitError(root, config, data, 'Network error. Please check your connection.');
  }
}

function showSubmitError(
  root: HTMLElement,
  config: WidgetConfig,
  data: FeedbackData,
  errorMessage: string
) {
  const modal = createModal(
    root,
    'Submission Failed',
    `
      <div class="bd-error-message">
        <svg class="bd-error-message__icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-9.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5.5zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
        </svg>
        <span class="bd-error-message__text">${errorMessage}</span>
      </div>
      <div class="bd-actions">
        <button class="bd-btn bd-btn-secondary" data-action="cancel">Cancel</button>
        <button class="bd-btn bd-btn-primary" data-action="retry">Try Again</button>
      </div>
    `
  );

  const closeBtn = modal.querySelector('.bd-close') as HTMLElement;
  const cancelBtn = modal.querySelector('[data-action="cancel"]') as HTMLElement;
  const retryBtn = modal.querySelector('[data-action="retry"]') as HTMLElement;

  closeBtn?.addEventListener('click', () => modal.remove());
  cancelBtn?.addEventListener('click', () => modal.remove());

  retryBtn?.addEventListener('click', async () => {
    modal.remove();
    await submitFeedback(root, config, data);
  });
}

function getElementSelector(element: Element): string {
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = `#${current.id}`;
      path.unshift(selector);
      break;
    }

    if (current.className) {
      // Handle SVG elements where className is SVGAnimatedString, not a string
      const classNameStr =
        typeof current.className === 'string'
          ? current.className
          : (current.className as SVGAnimatedString).baseVal || '';
      const classes = classNameStr
        .split(' ')
        .filter(c => c)
        .slice(0, 2);
      if (classes.length) {
        selector += `.${classes.join('.')}`;
      }
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}
