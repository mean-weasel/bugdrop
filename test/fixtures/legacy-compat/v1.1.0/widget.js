"use strict";(()=>{var A="https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js",E=null;async function N(){return E||new Promise((o,r)=>{let e=document.createElement("script");e.src=A,e.onload=()=>{E=window.htmlToImage,o(E)},e.onerror=()=>r(new Error("Failed to load html-to-image")),document.head.appendChild(e)})}async function M(o){let r=await N(),e=o||document.body;return await r.toPng(e,{cacheBust:!0,pixelRatio:window.devicePixelRatio||1,filter:n=>n.id!=="bugdrop-host"})}function S(){return new Promise(o=>{setTimeout(()=>{_(o)},50)})}function _(o){let r=document.createElement("div");r.id="bugdrop-element-picker-highlight",r.style.cssText=`
    position: fixed;
    pointer-events: none;
    border: 3px solid #14b8a6;
    background: rgba(20, 184, 166, 0.15);
    z-index: 2147483646;
    transition: all 0.05s ease-out;
    box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.3);
    border-radius: 6px;
  `,document.body.appendChild(r);let e=document.createElement("div");e.id="bugdrop-element-picker-tooltip",e.style.cssText=`
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #0f172a;
    color: #f1f5f9;
    padding: 14px 28px;
    border-radius: 10px;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 2147483647;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 40px rgba(34, 211, 238, 0.1);
    border: 1px solid #334155;
  `,e.textContent="Click on any element to capture it (ESC to cancel)",document.body.appendChild(e);let t=null;function n(c){let m=document.elementsFromPoint(c.clientX,c.clientY).find(u=>!(u===r||u===e||u.id==="bugdrop-element-picker-highlight"||u.id==="bugdrop-element-picker-tooltip"||u.closest("#bugdrop-host")));if(!m)return;t=m;let p=m.getBoundingClientRect();r.style.top=`${p.top-2}px`,r.style.left=`${p.left-2}px`,r.style.width=`${p.width+4}px`,r.style.height=`${p.height+4}px`,r.style.display="block"}function a(c){c.preventDefault(),c.stopPropagation(),d(),o(t)}function i(c){c.key==="Escape"&&(d(),o(null))}function d(){document.removeEventListener("mousemove",n,!0),document.removeEventListener("click",a,!0),document.removeEventListener("keydown",i),r.remove(),e.remove(),document.body.style.cursor=""}document.body.style.cursor="crosshair",document.addEventListener("mousemove",n,!0),document.addEventListener("click",a,!0),document.addEventListener("keydown",i)}function H(o,r){let e=document.createElement("canvas"),t=e.getContext("2d"),n="draw",a=!1,i=[],d=[],c=new Image;c.onload=()=>{let l=o.clientWidth||600,s=Math.min(1,l/c.width);e.width=c.width*s,e.height=c.height*s,e.style.maxWidth="100%",e.style.cursor="crosshair",t.scale(s,s),t.drawImage(c,0,0),p()},c.src=r,o.appendChild(e);let b="#ff0000",m=3;function p(){d.push(t.getImageData(0,0,e.width,e.height))}function u(l){let s=e.getBoundingClientRect(),g=c.width/s.width,v=c.height/s.height;return{x:(l.clientX-s.left)*g,y:(l.clientY-s.top)*v}}function x(l,s){t.beginPath(),t.moveTo(l.x,l.y),t.lineTo(s.x,s.y),t.strokeStyle=b,t.lineWidth=m,t.lineCap="round",t.stroke()}function y(l,s){x(l,s);let g=Math.atan2(s.y-l.y,s.x-l.x),v=15;t.beginPath(),t.moveTo(s.x,s.y),t.lineTo(s.x-v*Math.cos(g-Math.PI/6),s.y-v*Math.sin(g-Math.PI/6)),t.lineTo(s.x-v*Math.cos(g+Math.PI/6),s.y-v*Math.sin(g+Math.PI/6)),t.closePath(),t.fillStyle=b,t.fill()}function w(l,s){t.strokeStyle=b,t.lineWidth=m,t.strokeRect(l.x,l.y,s.x-l.x,s.y-l.y)}return e.addEventListener("mousedown",l=>{a=!0,i=[u(l)],p()}),e.addEventListener("mousemove",l=>{if(!a)return;let s=u(l);n==="draw"?(x(i[i.length-1],s),i.push(s)):(t.putImageData(d[d.length-1],0,0),n==="arrow"?y(i[0],s):n==="rect"&&w(i[0],s))}),e.addEventListener("mouseup",l=>{if(!a)return;a=!1;let s=u(l);n==="arrow"?y(i[0],s):n==="rect"&&w(i[0],s),i=[]}),{setTool(l){n=l},undo(){d.length>1&&(d.pop(),t.putImageData(d[d.length-1],0,0))},getImageData(){return e.toDataURL("image/png")},destroy(){e.remove()}}}function $(){return typeof window<"u"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}function C(o,r){let e=r.position==="bottom-left"?"left: 20px":"right: 20px",n=(r.theme==="auto"?$():r.theme)==="dark",a=document.createElement("style");a.textContent=`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

    :host {
      /* Typography */
      --bd-font: 'Space Grotesk', system-ui, sans-serif;

      /* Radius */
      --bd-radius-sm: 6px;
      --bd-radius-md: 10px;
      --bd-radius-lg: 14px;

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

    /* Trigger Button */
    .bd-trigger {
      position: fixed;
      bottom: 20px;
      ${e};
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: none;
      background: var(--bd-primary);
      color: var(--bd-primary-text);
      font-size: 24px;
      cursor: pointer;
      box-shadow:
        var(--bd-shadow-md),
        0 0 0 0 var(--bd-primary);
      z-index: 999999;
      transition: transform var(--bd-transition), box-shadow var(--bd-transition);
    }

    .bd-trigger:hover {
      transform: scale(1.08);
      box-shadow:
        var(--bd-shadow-lg),
        0 0 20px rgba(20, 184, 166, 0.3);
    }

    .bd-trigger:active {
      transform: scale(0.96);
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
      border: 1px solid var(--bd-border);
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
      border-bottom: 1px solid var(--bd-border);
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
      border: 1px solid var(--bd-border);
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
      box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.15);
    }

    .bd-dark .bd-input:focus, .bd-dark .bd-textarea:focus {
      box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.15);
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
      border: 1px solid var(--bd-border);
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
      border: 1px solid var(--bd-border);
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
      border: 1px solid var(--bd-border);
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
        width: 52px;
        height: 52px;
        bottom: 16px;
        font-size: 22px;
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
        transform: scale(0.95);
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
  `,o.appendChild(a);let i=document.createElement("div");return i.className=`bd-root${n?" bd-dark":""}`,o.appendChild(i),i}function h(o,r,e){let t=document.createElement("div");return t.className="bd-overlay",t.innerHTML=`
    <div class="bd-modal">
      <div class="bd-header">
        <h2 class="bd-title">${r}</h2>
        <button class="bd-close">&times;</button>
      </div>
      <div class="bd-body">
        ${e}
      </div>
    </div>
  `,o.appendChild(t),t}function P(o,r,e,t){return new Promise(n=>{let a=t?`
        <p class="bd-success-issue">Issue <strong>#${r}</strong> has been created.</p>
        <a href="${e}" target="_blank" rel="noopener noreferrer" class="bd-issue-link">
          <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/>
          </svg>
          View on GitHub
        </a>
      `:'<p class="bd-success-issue">Your feedback has been submitted successfully.</p>',i=h(o,"Feedback Submitted!",`
        <div class="bd-success-content">
          <div class="bd-success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          ${a}
        </div>
        <div class="bd-actions">
          <button class="bd-btn bd-btn-primary" data-action="done">Done</button>
        </div>
      `),d=i.querySelector(".bd-close"),c=i.querySelector('[data-action="done"]'),b=()=>{i.remove(),n()};d?.addEventListener("click",b),c?.addEventListener("click",b)})}var z="bugdrop_dismissed",W=null;function F(){try{return localStorage.getItem(z)==="true"}catch{return!1}}function j(){try{localStorage.setItem(z,"true")}catch{}}var f=document.currentScript,R=f?.dataset.theme,q={repo:f?.dataset.repo||"",apiUrl:f?.src.replace("/widget.js","/api")||"",position:f?.dataset.position||"bottom-right",theme:R||"auto",showName:f?.dataset.showName==="true",requireName:f?.dataset.requireName==="true",showEmail:f?.dataset.showEmail==="true",requireEmail:f?.dataset.requireEmail==="true",buttonDismissible:f?.dataset.buttonDismissible==="true"};q.repo?U(q):console.error("[BugDrop] Missing data-repo attribute");function U(o){let r=document.createElement("div");r.id="bugdrop-host",document.body.appendChild(r);let e=r.attachShadow({mode:"open"}),t=C(e,o);if(W=t,o.buttonDismissible&&F())return;let n=document.createElement("button");if(n.className="bd-trigger",n.innerHTML="\u{1F41B}",n.setAttribute("aria-label","Report a bug or send feedback"),o.buttonDismissible){let a=document.createElement("button");a.className="bd-trigger-close",a.innerHTML="\xD7",a.setAttribute("aria-label","Dismiss feedback button"),n.appendChild(a),a.addEventListener("click",i=>{i.stopPropagation(),j(),n.remove()})}t.appendChild(n),n.addEventListener("click",()=>Y(t,o))}async function Y(o,r){if(!await G(r)){O(o,r);return}let t=await X(o),n=null,a=null;if(t==="capture")n=await T(o);else if(t==="element"){let c=await S();c&&(n=await T(o,c),a=J(c))}let i=n;n&&(i=await V(o,n));let d=await K(o,i,r);d&&await D(o,r,{...d,screenshot:i,elementSelector:a})}async function T(o,r){let e=h(o,"Capturing...",`
      <div style="display: flex; flex-direction: column; align-items: center; padding: 20px;">
        <div class="bd-spinner bd-spinner--lg"></div>
        <p class="bd-loading-text" style="margin-top: 12px;">Capturing screenshot...</p>
      </div>
    `);try{let t=await M(r);return e.remove(),t}catch{return e.remove(),new Promise(n=>{let a=h(o,"Capture Failed",`
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
        `),i=a.querySelector(".bd-close"),d=a.querySelector('[data-action="skip"]'),c=a.querySelector('[data-action="retry"]');i?.addEventListener("click",()=>{a.remove(),n(null)}),d?.addEventListener("click",()=>{a.remove(),n(null)}),c?.addEventListener("click",async()=>{a.remove();let b=await T(o,r);n(b)})})}}async function G(o){try{return(await(await fetch(`${o.apiUrl}/check/${o.repo}`)).json()).installed===!0}catch{return!1}}function O(o,r){let e=h(o,"Install Required",`
      <p style="margin: 0 0 16px; color: var(--bd-text-secondary);">BugDrop requires GitHub App installation to create issues.</p>
      <div class="bd-actions">
        <button class="bd-btn bd-btn-secondary" data-action="cancel">Cancel</button>
        <a href="https://github.com/apps/YOUR_APP_NAME/installations/new" target="_blank" class="bd-btn bd-btn-primary" style="text-decoration: none;">Install App</a>
      </div>
    `),t=e.querySelector(".bd-close"),n=e.querySelector('[data-action="cancel"]');t?.addEventListener("click",()=>e.remove()),n?.addEventListener("click",()=>e.remove())}function X(o){return new Promise(r=>{let e=h(o,"Capture Screenshot",`
        <p style="margin: 0 0 16px; color: var(--bd-text-secondary);">Would you like to include a screenshot with your feedback?</p>
        <div class="bd-actions">
          <button class="bd-btn bd-btn-secondary" data-action="skip">Skip</button>
          <button class="bd-btn bd-btn-secondary" data-action="element">Select Element</button>
          <button class="bd-btn bd-btn-primary" data-action="capture">Full Page</button>
        </div>
      `),t=e.querySelector(".bd-close"),n=e.querySelector('[data-action="skip"]'),a=e.querySelector('[data-action="element"]'),i=e.querySelector('[data-action="capture"]');t?.addEventListener("click",()=>{e.remove(),r("skip")}),n?.addEventListener("click",()=>{e.remove(),r("skip")}),a?.addEventListener("click",()=>{e.remove(),r("element")}),i?.addEventListener("click",()=>{e.remove(),r("capture")})})}function V(o,r){return new Promise(e=>{let t=h(o,"Annotate Screenshot",`
        <div class="bd-tools">
          <button class="bd-tool active" data-tool="draw">\u270F\uFE0F Draw</button>
          <button class="bd-tool" data-tool="arrow">\u27A1\uFE0F Arrow</button>
          <button class="bd-tool" data-tool="rect">\u25A2 Rectangle</button>
          <button class="bd-tool" data-action="undo">\u21B6 Undo</button>
        </div>
        <div id="annotation-canvas"></div>
        <div class="bd-actions">
          <button class="bd-btn bd-btn-secondary" data-action="skip">Skip Annotations</button>
          <button class="bd-btn bd-btn-primary" data-action="done">Done</button>
        </div>
      `),n=t.querySelector("#annotation-canvas"),a=H(n,r),i=t.querySelectorAll("[data-tool]");i.forEach(m=>{m.addEventListener("click",p=>{let u=p.target,x=u.dataset.tool;x==="undo"?a.undo():x&&(i.forEach(y=>y.classList.remove("active")),u.classList.add("active"),a.setTool(x))})});let d=t.querySelector(".bd-close"),c=t.querySelector('[data-action="skip"]'),b=t.querySelector('[data-action="done"]');d?.addEventListener("click",()=>{a.destroy(),t.remove(),e(r)}),c?.addEventListener("click",()=>{a.destroy(),t.remove(),e(r)}),b?.addEventListener("click",()=>{let m=a.getImageData();a.destroy(),t.remove(),e(m)})})}function K(o,r,e){return new Promise(t=>{let n=r?`<div class="bd-preview"><img src="${r}" alt="Screenshot preview" /></div>`:"",a=e.showName?`
          <div class="bd-form-group">
            <label class="bd-label" for="name">Name${e.requireName?" *":""}</label>
            <input type="text" id="name" class="bd-input" ${e.requireName?"required":""} placeholder="Your name" />
          </div>
        `:"",i=e.showEmail?`
          <div class="bd-form-group">
            <label class="bd-label" for="email">Email${e.requireEmail?" *":""}</label>
            <input type="email" id="email" class="bd-input" ${e.requireEmail?"required":""} placeholder="your@email.com" />
          </div>
        `:"",d=h(o,"Send Feedback",`
        ${n}
        <form id="feedback-form">
          ${a}
          ${i}
          <div class="bd-form-group">
            <label class="bd-label" for="title">Title *</label>
            <input type="text" id="title" class="bd-input" required placeholder="Brief description of the issue" />
          </div>
          <div class="bd-form-group">
            <label class="bd-label" for="description">Description</label>
            <textarea id="description" class="bd-textarea" placeholder="Additional details..."></textarea>
          </div>
          <div class="bd-actions">
            <button type="button" class="bd-btn bd-btn-secondary" data-action="cancel">Cancel</button>
            <button type="submit" class="bd-btn bd-btn-primary" id="submit-btn">Submit</button>
          </div>
        </form>
      `),c=d.querySelector("#feedback-form"),b=d.querySelector("#name"),m=d.querySelector("#email"),p=d.querySelector("#title"),u=d.querySelector("#description"),x=d.querySelector(".bd-close"),y=d.querySelector('[data-action="cancel"]'),w=l=>{l.classList.remove("bd-input--error");let s=l.parentElement?.querySelector(".bd-field-error");s&&s.remove()};p?.addEventListener("input",()=>w(p)),b?.addEventListener("input",()=>w(b)),m?.addEventListener("input",()=>w(m)),x?.addEventListener("click",()=>{d.remove(),t(null)}),y?.addEventListener("click",()=>{d.remove(),t(null)}),c?.addEventListener("submit",l=>{l.preventDefault();let s=!1,g=(k,B)=>{if(k.classList.add("bd-input--error"),!k.parentElement?.querySelector(".bd-field-error")){let L=document.createElement("div");L.className="bd-field-error",L.textContent=B,k.parentElement?.appendChild(L)}s||(k.focus(),s=!0)};e.requireName&&b&&!b.value.trim()&&g(b,"Name is required"),e.requireEmail&&m&&!m.value.trim()&&g(m,"Email is required");let v=p.value.trim();v||g(p,"Title is required"),!s&&(d.remove(),t({title:v,description:u.value.trim(),name:b?.value.trim()||void 0,email:m?.value.trim()||void 0}))})})}async function D(o,r,e){let t=h(o,"Submitting...",`
      <div style="display: flex; flex-direction: column; align-items: center; padding: 20px;">
        <div class="bd-spinner bd-spinner--lg"></div>
        <p class="bd-loading-text" style="margin-top: 12px;">Creating issue...</p>
      </div>
    `);try{let n=e.name||e.email?{name:e.name,email:e.email}:void 0,i=await(await fetch(`${r.apiUrl}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({repo:r.repo,title:e.title,description:e.description,screenshot:e.screenshot,submitter:n,metadata:{url:window.location.href,userAgent:navigator.userAgent,viewport:{width:window.innerWidth,height:window.innerHeight},timestamp:new Date().toISOString(),elementSelector:e.elementSelector}})})).json();t.remove(),i.success?await P(o,i.issueNumber,i.issueUrl,i.isPublic??!1):I(o,r,e,i.error||"Failed to submit")}catch{t.remove(),I(o,r,e,"Network error. Please check your connection.")}}function I(o,r,e,t){let n=h(o,"Submission Failed",`
      <div class="bd-error-message">
        <svg class="bd-error-message__icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-9.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5.5zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
        </svg>
        <span class="bd-error-message__text">${t}</span>
      </div>
      <div class="bd-actions">
        <button class="bd-btn bd-btn-secondary" data-action="cancel">Cancel</button>
        <button class="bd-btn bd-btn-primary" data-action="retry">Try Again</button>
      </div>
    `),a=n.querySelector(".bd-close"),i=n.querySelector('[data-action="cancel"]'),d=n.querySelector('[data-action="retry"]');a?.addEventListener("click",()=>n.remove()),i?.addEventListener("click",()=>n.remove()),d?.addEventListener("click",async()=>{n.remove(),await D(o,r,e)})}function J(o){let r=[],e=o;for(;e&&e!==document.body;){let t=e.tagName.toLowerCase();if(e.id){t=`#${e.id}`,r.unshift(t);break}if(e.className){let a=(typeof e.className=="string"?e.className:e.className.baseVal||"").split(" ").filter(i=>i).slice(0,2);a.length&&(t+=`.${a.join(".")}`)}r.unshift(t),e=e.parentElement}return r.join(" > ")}})();
