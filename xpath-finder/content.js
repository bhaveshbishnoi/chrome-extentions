/**
 * XPath Finder Pro - Content Script
 */

(function() {
  let isEnabled = false; // Default to OFF
  let isLocked = false;
  let isPaused = false;
  let lockedElement = null;
  let panelContainer = null;
  let shadowRoot = null;
  let highlightElement = null;

  // Configuration
  const HASH_REGEX = /[a-f0-9]{8,}|[0-9]{4,}/i; // Potential hashes or long numbers
  const DYNAMIC_CLASS_REGEX = /(?:css|jss|styled|emotion)-\w+/i;

  // Initialize
  function init() {
    createUI();
    setupListeners();
    checkInitialState();
  }

  function checkInitialState() {
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
      if (response && response.enabled !== undefined) {
        isEnabled = response.enabled;
        updateUIState();
      }
    });
  }

  function createUI() {
    if (panelContainer) return;

    panelContainer = document.createElement('div');
    panelContainer.id = 'xfp-panel-container';
    shadowRoot = panelContainer.attachShadow({ mode: 'open' });

    // Inject CSS into Shadow DOM
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content.css');
    shadowRoot.appendChild(link);

    const panel = document.createElement('div');
    panel.id = 'xfp-panel';
    panel.innerHTML = `
      <div class="xfp-header" id="xfp-drag-handle">
        <div class="xfp-logo">XPATH FINDER PRO</div>
        <div class="xfp-controls">
          <button class="xfp-btn-icon" id="xfp-pause-btn" title="Pause/Resume (P)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="xfp-pause-icon"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
          </button>
          <button class="xfp-btn-icon" id="xfp-lock-btn" title="Lock Element (L)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          </button>
          <button class="xfp-btn-icon" id="xfp-close-btn" title="Close Panel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>

      <div class="xfp-section">
        <div class="xfp-label">
          <span>Relative XPath</span>
          <span id="xfp-xpath-count">0 matches</span>
        </div>
        <div class="xfp-value-container">
          <div class="xfp-value" id="xfp-xpath-val">Select an element...</div>
          <button class="xfp-copy-btn" data-target="xfp-xpath-val">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
      </div>

      <div class="xfp-section">
        <div class="xfp-label">CSS Selector</div>
        <div class="xfp-value-container">
          <div class="xfp-value" id="xfp-css-val">-</div>
          <button class="xfp-copy-btn" data-target="xfp-css-val">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
      </div>

      <div class="xfp-stats">
        <div class="xfp-stat-card">
          <div class="xfp-stat-label">STABILITY SCORE</div>
          <div class="xfp-stat-value xfp-stability-high" id="xfp-stability-val">0%</div>
        </div>
        <div class="xfp-stat-card">
          <div class="xfp-stat-label">ELEMENT</div>
          <div class="xfp-stat-value" id="xfp-tag-val">-</div>
        </div>
      </div>
    `;

    shadowRoot.appendChild(panel);
    document.documentElement.appendChild(panelContainer);

    // Create Highlight Overlay (outside shadow DOM to not affect layout)
    highlightElement = document.createElement('div');
    highlightElement.className = 'xfp-highlight';
    highlightElement.style.display = 'none';
    document.documentElement.appendChild(highlightElement);

    setupPanelEvents();
  }

  function setupListeners() {
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('click', handleClick, true);
    window.addEventListener('keydown', handleKeyDown, true);

    // Listen for storage changes from popup
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.enabled) {
        isEnabled = changes.enabled.newValue;
        updateUIState();
      }
    });
  }

  function handleMouseMove(e) {
    if (!isEnabled || isLocked || isPaused) return;

    // Handle Shadow DOM and Iframes
    const path = e.composedPath();
    const target = path[0];

    if (target === hoveredElement || target === panelContainer || target.id === 'xfp-panel-container') return;

    hoveredElement = target;
    updateHighlight(target);
    generateLocators(target);
  }

  function handleClick(e) {
    if (!isEnabled) return;
    
    // Check if clicking inside our panel
    if (e.composedPath().some(el => el === panelContainer)) return;

    e.preventDefault();
    e.stopPropagation();

    toggleLock();
  }

  function handleKeyDown(e) {
    const key = e.key.toLowerCase();
    if (key === 'l') {
      toggleLock();
    }
    if (key === 'p') {
      togglePause();
    }
    if (e.key === 'Escape') {
      if (isLocked) toggleLock();
      else setEnabled(false);
    }
  }

  function togglePause() {
    isPaused = !isPaused;
    const pauseBtn = shadowRoot.getElementById('xfp-pause-btn');
    const pauseIcon = shadowRoot.getElementById('xfp-pause-icon');
    
    if (isPaused) {
      pauseBtn.classList.add('xfp-active');
      pauseIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>'; // Play icon
      highlightElement.style.display = 'none';
    } else {
      pauseBtn.classList.remove('xfp-active');
      pauseIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>'; // Pause icon
    }
  }

  function toggleLock() {
    isLocked = !isLocked;
    const lockBtn = shadowRoot.getElementById('xfp-lock-btn');
    if (isLocked) {
      lockedElement = hoveredElement;
      lockBtn.classList.add('xfp-locked');
      highlightElement.classList.add('xfp-locked');
    } else {
      lockBtn.classList.remove('xfp-locked');
      highlightElement.classList.remove('xfp-locked');
      lockedElement = null;
    }
  }

  function updateHighlight(el) {
    if (!el || el === document.body || el === document.documentElement) {
      highlightElement.style.display = 'none';
      return;
    }

    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    highlightElement.style.display = 'block';
    highlightElement.style.width = `${rect.width}px`;
    highlightElement.style.height = `${rect.height}px`;
    highlightElement.style.top = `${rect.top + scrollY}px`;
    highlightElement.style.left = `${rect.left + scrollX}px`;
  }

  // --- Locator Logic ---

  function generateLocators(el) {
    if (!el) return;

    const xpath = getRelativeXPath(el);
    const css = getCSSSelector(el);
    const tag = el.tagName.toLowerCase();
    const stability = calculateStability(el, xpath);

    shadowRoot.getElementById('xfp-xpath-val').textContent = xpath;
    shadowRoot.getElementById('xfp-css-val').textContent = css;
    shadowRoot.getElementById('xfp-tag-val').textContent = tag;
    
    const stabilityEl = shadowRoot.getElementById('xfp-stability-val');
    stabilityEl.textContent = `${stability}%`;
    stabilityEl.className = 'xfp-stat-value ' + (stability > 80 ? 'xfp-stability-high' : stability > 50 ? 'xfp-stability-med' : 'xfp-stability-low');

    // Validation
    try {
      const count = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null).snapshotLength;
      shadowRoot.getElementById('xfp-xpath-count').textContent = `${count} match${count === 1 ? '' : 'es'}`;
    } catch (e) {
      shadowRoot.getElementById('xfp-xpath-count').textContent = 'Invalid XPath';
    }
  }

  function getRelativeXPath(el) {
    const tag = el.tagName.toLowerCase();

    // 1. Check for data-testid or similar
    const testAttrs = ['data-testid', 'data-qa', 'data-cy'];
    for (const attr of testAttrs) {
      const val = el.getAttribute(attr);
      if (val && !HASH_REGEX.test(val)) {
        return `//*[@${attr}='${val}']`;
      }
    }

    // 2. Check for unique ID (if not dynamic)
    if (el.id && !HASH_REGEX.test(el.id)) {
      return `//*[@id='${el.id}']`;
    }

    // 3. Stable attributes (name, aria-label, placeholder)
    const stableAttrs = ['name', 'aria-label', 'placeholder', 'title', 'alt'];
    for (const attr of stableAttrs) {
      const val = el.getAttribute(attr);
      if (val && !HASH_REGEX.test(val)) {
        return `//${tag}[@${attr}='${val}']`;
      }
    }

    // 4. Stable class names
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(/\s+/).filter(c => c && !DYNAMIC_CLASS_REGEX.test(c) && !HASH_REGEX.test(c));
      if (classes.length > 0) {
        // Try the first stable class
        const firstClass = classes[0];
        const xpath = `//${tag}[contains(@class, '${firstClass}')]`;
        const count = countMatches(xpath);
        if (count === 1) return xpath;
      }
    }

    // 5. Text content (for buttons, links, etc.)
    if (['button', 'a', 'span', 'label', 'h1', 'h2', 'h3'].includes(tag)) {
      const text = el.textContent.trim();
      if (text && text.length > 0 && text.length < 50 && !HASH_REGEX.test(text)) {
        const cleanText = text.replace(/'/g, "&apos;");
        const xpath = `//${tag}[contains(text(), '${cleanText}')]`;
        if (countMatches(xpath) === 1) return xpath;
      }
    }

    // 6. Attribute combinations (e.g. tag + type + value)
    if (el.getAttribute('type') && el.getAttribute('value')) {
      return `//${tag}[@type='${el.getAttribute('type')}' and @value='${el.getAttribute('value')}']`;
    }

    // 7. Fallback to path construction
    return getFullPath(el);
  }

  function countMatches(xpath) {
    try {
      return document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null).snapshotLength;
    } catch (e) {
      return 0;
    }
  }

  function getFullPath(el) {
    if (el.id && !HASH_REGEX.test(el.id)) return `//*[@id='${el.id}']`;
    if (el === document.body) return '/html/body';

    let index = 1;
    let sib = el.previousElementSibling;
    while (sib) {
      if (sib.tagName === el.tagName) index++;
      sib = sib.previousElementSibling;
    }

    const tag = el.tagName.toLowerCase();
    return `${getFullPath(el.parentElement)}/${tag}[${index}]`;
  }

  function getCSSSelector(el) {
    if (el.id && !HASH_REGEX.test(el.id)) return `#${el.id}`;
    
    let selector = el.tagName.toLowerCase();
    
    // Filter out dynamic classes
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(/\s+/).filter(c => c && !DYNAMIC_CLASS_REGEX.test(c) && !HASH_REGEX.test(c));
      if (classes.length > 0) {
        selector += '.' + classes.join('.');
      }
    }

    // Attributes
    const testAttrs = ['data-testid', 'data-qa', 'name'];
    for (const attr of testAttrs) {
      const val = el.getAttribute(attr);
      if (val) return `[${attr}='${val}']`;
    }

    return selector;
  }

  function calculateStability(el, xpath) {
    let score = 50; // Neutral start

    if (xpath.includes('@data-testid') || xpath.includes('@data-qa')) score += 45;
    else if (xpath.includes('@id')) score += 30;
    else if (xpath.includes('contains(text()')) score += 20;

    if (xpath.includes('/html/body')) score -= 30; // Brittle full path
    if (HASH_REGEX.test(el.id || '') || HASH_REGEX.test(el.className || '')) score -= 20;

    return Math.max(0, Math.min(100, score));
  }

  // --- UI Interactions ---

  function setupPanelEvents() {
    const dragHandle = shadowRoot.getElementById('xfp-drag-handle');
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panelContainer.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      panelContainer.style.right = 'auto';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      panelContainer.style.left = `${initialLeft + dx}px`;
      panelContainer.style.top = `${initialTop + dy}px`;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    shadowRoot.getElementById('xfp-lock-btn').onclick = toggleLock;
    shadowRoot.getElementById('xfp-pause-btn').onclick = togglePause;
    shadowRoot.getElementById('xfp-close-btn').onclick = () => setEnabled(false);

    // Copying
    shadowRoot.querySelectorAll('.xfp-copy-btn').forEach(btn => {
      btn.onclick = () => {
        const targetId = btn.getAttribute('data-target');
        const text = shadowRoot.getElementById(targetId).textContent;
        navigator.clipboard.writeText(text);
        
        // Visual feedback
        const originalSVG = btn.innerHTML;
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--xfp-success)"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => btn.innerHTML = originalSVG, 1500);
      };
    });
  }

  function setEnabled(val) {
    isEnabled = val;
    chrome.storage.local.set({ enabled: val });
    updateUIState();
  }

  function updateUIState() {
    if (!isEnabled) {
      panelContainer.style.display = 'none';
      highlightElement.style.display = 'none';
    } else {
      panelContainer.style.display = 'block';
    }
  }

  // Run
  init();
})();
