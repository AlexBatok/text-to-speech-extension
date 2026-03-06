(() => {
  'use strict';

  const SKIP_TAGS = new Set([
    'script', 'style', 'noscript', 'svg', 'nav', 'aside',
    'select', 'textarea', 'button', 'label', 'audio', 'video',
    'dialog', 'embed', 'menu', 'noframes', 'object', 'sup', 'footer'
  ]);

  const BLOCK_TAGS = new Set([
    'p', 'li', 'td', 'th', 'dd', 'dt', 'blockquote', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figcaption', 'caption'
  ]);

  function isVisible(el) {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (!el.offsetParent && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (style.position !== 'fixed' && style.position !== 'sticky') return false;
    }
    const style = getComputedStyle(el);
    if (style.opacity === '0') return false;
    if (parseFloat(style.height) === 0 && style.overflow === 'hidden') return false;
    return true;
  }

  function shouldSkip(el) {
    if (el.nodeType !== Node.ELEMENT_NODE) return true;
    if (SKIP_TAGS.has(el.tagName.toLowerCase())) return true;
    if (!isVisible(el)) return true;
    const style = getComputedStyle(el);
    if (style.position === 'fixed' || style.position === 'sticky') return true;
    return false;
  }

  function hasBlockChildren(el) {
    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();
      if (BLOCK_TAGS.has(tag) || tag === 'div' || tag === 'section' || tag === 'article' ||
          tag === 'ul' || tag === 'ol' || tag === 'table' || tag === 'details') {
        return true;
      }
    }
    return false;
  }

  function getCleanText(el) {
    let text = el.innerText || '';
    text = text.trim();
    // Add missing punctuation at line breaks
    text = text.replace(/(\w)(\s*\n)/g, '$1. ');
    // Collapse multiple spaces
    text = text.replace(/\s{2,}/g, ' ');
    return text.trim();
  }

  function extractTextBlocks(root, threshold) {
    const blocks = [];

    function walk(el) {
      if (shouldSkip(el)) return;

      const tag = el.tagName.toLowerCase();

      // Lists: aggregate items
      if (tag === 'ul' || tag === 'ol') {
        const text = getCleanText(el);
        if (text.length >= threshold) {
          blocks.push({ text, element: el });
        }
        return;
      }

      // Tables: treat as block
      if (tag === 'table' || tag === 'tbody') {
        const text = getCleanText(el);
        if (text.length >= threshold) {
          blocks.push({ text, element: el });
        }
        return;
      }

      // Block-level text containers
      if (BLOCK_TAGS.has(tag)) {
        const text = getCleanText(el);
        const isHeading = tag[0] === 'h' && tag.length === 2;
        if (text && (isHeading || text.length >= threshold)) {
          blocks.push({ text, element: el });
        }
        return;
      }

      // Div/section/article with no block children = leaf block
      if ((tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main') &&
          !hasBlockChildren(el)) {
        const text = getCleanText(el);
        if (text.length >= threshold) {
          blocks.push({ text, element: el });
        }
        return;
      }

      // Recurse into children
      for (const child of el.children) {
        walk(child);
      }
    }

    walk(root);
    return blocks;
  }

  function gaussianTrim(blocks) {
    if (blocks.length < 5) return blocks;

    const lengths = blocks.map(b => b.text.length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, l) => a + (l - mean) ** 2, 0) / lengths.length;
    const stddev = Math.sqrt(variance);
    const lower = mean - 2 * stddev;
    const upper = mean + 2 * stddev;

    // Only trim from head/tail (navigation, footer remnants)
    let start = 0;
    while (start < blocks.length && blocks[start].text.length < lower) start++;

    let end = blocks.length - 1;
    while (end > start && blocks[end].text.length < lower) end--;

    return blocks.slice(start, end + 1);
  }

  function doExtract() {
    const root = document.body;
    if (!root) return [];

    // First pass: threshold 50
    let blocks = extractTextBlocks(root, 50);

    // If too little text, retry with lower threshold
    const totalChars = blocks.reduce((s, b) => s + b.text.length, 0);
    if (totalChars < 1000) {
      blocks = extractTextBlocks(root, 3);
      blocks = gaussianTrim(blocks);
    }

    return blocks;
  }

  function detectLanguage() {
    const lang = document.documentElement.lang || document.body.lang || '';
    // Normalize BCP-47: "en-US" → "en-US", "zh_CN" → "zh-CN"
    return lang.replace('_', '-').trim() || 'en';
  }

  function getSelectedText() {
    return (window.getSelection() || '').toString().trim();
  }

  // Message listener
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (msg.action === 'extractText') {
        const blocks = doExtract();
        const lang = detectLanguage();
        // Store element refs for highlighting
        window.__ttsBlockElements = blocks.map(b => b.element);
        sendResponse({
          blocks: blocks.map(b => b.text),
          lang
        });
      } else if (msg.action === 'getSelection') {
        sendResponse({ text: getSelectedText() });
      } else if (msg.action === 'getLang') {
        sendResponse({ lang: detectLanguage() });
      } else if (msg.action === 'highlight') {
        highlightBlock(msg.blockIndex);
        sendResponse({ success: true });
      } else if (msg.action === 'clearHighlight') {
        clearHighlight();
        sendResponse({ success: true });
      }
    } catch (err) {
      console.error('TTS extractor error:', err);
      sendResponse({ error: err.message });
    }
    return true;
  });

  // Highlighting (Task 7.1 — included here to avoid separate injection)
  let currentHighlight = null;

  function highlightBlock(index) {
    clearHighlight();
    const el = window.__ttsBlockElements?.[index];
    if (!el) return;
    el.style.outline = '2px solid #4a90d9';
    el.style.outlineOffset = '2px';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    currentHighlight = el;
  }

  function clearHighlight() {
    if (currentHighlight) {
      currentHighlight.style.outline = '';
      currentHighlight.style.outlineOffset = '';
      currentHighlight = null;
    }
  }
})();
