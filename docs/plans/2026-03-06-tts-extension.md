# Text-to-Speech Chrome Extension — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a lightweight (<100 KiB), privacy-first TTS Chrome extension that reads any webpage aloud using the Web Speech API — no account, no limits, no cloud.

**Architecture:** Content script extracts text via DOM traversal, sends blocks to service worker. Service worker chunks text (paragraph → sentence → phrase) and plays sequentially via `chrome.tts`. Popup and floating widget provide controls. Settings persist in `chrome.storage.local`, playback state in `chrome.storage.session` with in-memory cache.

**Tech Stack:** Vanilla JS (ES2022+), Vanilla CSS with custom properties, Chrome MV3, `chrome.tts` API

**Feature Branch:** `main` (new project, no branching needed yet)

---

## Phase 1: Foundation

### Task 1.1: Create manifest.json

**Files:** Create `manifest.json`

**Step 1: Create the manifest**

```json
{
  "manifest_version": 3,
  "name": "Text to Speech — Read Aloud Any Page",
  "version": "1.0.0",
  "description": "Read any webpage aloud with natural voices. Lightweight, private, works offline.",
  "permissions": ["activeTab", "contextMenus", "storage", "tts", "scripting"],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "commands": {
    "play-pause": { "suggested_key": { "default": "Alt+P" }, "description": "Play or pause reading" },
    "stop": { "suggested_key": { "default": "Alt+S" }, "description": "Stop reading" },
    "forward": { "suggested_key": { "default": "Alt+Period" }, "description": "Next sentence" },
    "rewind": { "suggested_key": { "default": "Alt+Comma" }, "description": "Previous sentence" }
  },
  "minimum_chrome_version": "116"
}
```

5 permissions only: `activeTab`, `contextMenus`, `storage`, `tts`, `scripting`. No `<all_urls>`, no `tabs`, no `offscreen`.

**Step 2: Create placeholder icon files**

Create `icons/` directory with simple placeholder PNGs (16, 32, 48, 128px). These will be replaced with proper icons in Phase 11.

**Step 3: Verify**

Load unpacked at `chrome://extensions` → no errors, icon visible in toolbar.

---

### Task 1.2: Service worker skeleton

**Files:** Create `background/service-worker.js`, `background/tts-engine.js`, `background/text-chunker.js`

**Step 1: Create service-worker.js**

- Import `tts-engine.js` and `text-chunker.js` as ES modules
- `chrome.tts.stop()` on module load (cold-start workaround from competitor `tts-engines.js:43`)
- `chrome.runtime.onInstalled` → create context menu "Read aloud" for `selection` context
- `chrome.contextMenus.onClicked` → handle selection reading
- `chrome.commands.onCommand` → dispatch play-pause/stop/forward/rewind
- `chrome.runtime.onMessage` → dispatch map: `play`, `pause`, `resume`, `stop`, `forward`, `rewind`, `getState`, `getVoices`, `updateSettings`
- Message listener MUST `return true` for async responses

**Step 2: Create tts-engine.js (empty exports)**

Export stubs: `startPlayback()`, `pause()`, `resume()`, `stop()`, `forward()`, `rewind()`, `getState()`, `getVoices()`

**Step 3: Create text-chunker.js (empty export)**

Export stub: `chunkText(textBlocks, lang)`

**Step 4: Verify**

Reload extension, open service worker DevTools, confirm "Service worker registered" in console, no import errors.

---

### Task 1.3: Popup skeleton

**Files:** Create `popup/popup.html`, `popup/popup.css`, `popup/popup.js`

**Step 1: Create popup.html**

Minimal structure:
- Controls: rewind, play, pause (hidden), stop, forward buttons (SVG icons inline)
- Speed slider: range 0.5-3, step 0.1, default 1.0
- Voice dropdown: `<select id="voice">`
- Pitch slider: range 0-2, step 0.1, default 1.0
- Status text area

Key UX fix vs competitors: settings (voice, speed, pitch) ALWAYS visible, not hidden behind a gear button.

**Step 2: Create popup.css**

- CSS custom properties for all colors
- `@media (prefers-color-scheme: dark)` block
- System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- Body width: 360px
- CSS grid for control layout

**Step 3: Create popup.js**

- `DOMContentLoaded` → query state, load voices, load settings
- Button click handlers → `chrome.runtime.sendMessage()`
- Stub all handlers (real logic in later phases)

**Step 4: Verify**

Click extension icon → popup opens, controls visible, no console errors.

---

## Phase 2: Text Extraction

### Task 2.1: DOM traversal and text block extraction

**Files:** Create `content/extractor.js`

Reference: `competitors/Read Aloud A Text to Speech Voice Reader/js/content/html-doc.js`

**Step 1: Create extractor.js as IIFE**

The content script runs in page context. Structure as IIFE to avoid polluting global scope.

**Core constants:**
```js
const SKIP_TAGS = new Set([
  'script','style','noscript','svg','nav','aside',
  'select','textarea','button','label','audio','video',
  'dialog','embed','menu','noframes','object','sup'
]);
```

**Core functions:**

`isVisible(el)` — check `offsetParent`, `getComputedStyle` for display/visibility/opacity, `aria-hidden`

`shouldSkip(el)` — check SKIP_TAGS, isVisible, fixed/sticky position

`extractTextBlocks(root = document.body, threshold = 50)` — recursive walker:
1. Walk children of root
2. For each element: if shouldSkip → continue
3. If element is `p, li, td, th, dd, blockquote, pre, h1-h6` or has `innerText.length >= threshold` and no block-level children → collect as text block
4. Otherwise recurse into children
5. Special handling: `ol/ul` (aggregate items), `table/tbody` (check row count > 3)
6. If total chars < 1000, retry with threshold=3 and trim outliers (Gaussian filtering from competitor)

`getCleanText(el)` — `el.innerText.trim()`, add missing punctuation at line breaks: `/(\w)(\s*\n)/g` → `$1. $2`

`detectLanguage()` — check `document.documentElement.lang`, normalize BCP-47

**Return:** Array of `{ text: string, element: Element }` pairs (element ref kept for highlighting)

**Step 2: Wire message listener**

```js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'extractText') {
    const blocks = extractTextBlocks();
    const lang = detectLanguage();
    sendResponse({ blocks: blocks.map(b => b.text), lang });
  }
  return true;
});
```

**Step 3: Verify**

- Inject manually on Wikipedia: `chrome.scripting.executeScript({ target: {tabId}, files: ['content/extractor.js'] })`
- Send `extractText` message, log result
- Confirm: meaningful text blocks, no nav/footer/script content, no empty blocks
- Test on: Wikipedia, Reddit, a news site

---

### Task 2.2: Selection text handling

**Files:** Modify `content/extractor.js`

**Step 1: Add getSelectedText()**

```js
if (msg.action === 'getSelection') {
  sendResponse({ text: window.getSelection().toString().trim() });
}
```

**Step 2: Verify**

Select text on page, send message, confirm correct text returned.

---

## Phase 3: Text Chunking

### Task 3.1: Paragraph and sentence splitting

**Files:** Implement `background/text-chunker.js`

Reference: `competitors/Read Aloud A Text to Speech Voice Reader/js/speech.js` — LatinPunctuator (lines 397-430), CharBreaker (lines 348-395)

**Step 1: Implement splitters**

```js
export function chunkText(textBlocks, lang = 'en') {
  const isEastAsian = /^(zh|ja|ko)/.test(lang);
  const allChunks = [];

  for (const text of textBlocks) {
    const paragraphs = splitParagraphs(text);
    for (const para of paragraphs) {
      const sentences = isEastAsian ? splitSentencesEA(para) : splitSentences(para);
      const merged = mergeChunks(sentences, 200);
      allChunks.push(...merged);
    }
  }
  return allChunks;
}
```

`splitParagraphs(text)` — split on `/((?:\r?\n\s*){2,})/`, filter empties

`splitSentences(text)` — split on `/([.!?]+[\s\u200b]+)/` then recombine if previous segment ends with abbreviation:
```js
const ABBREVS = /\b(Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|Gen|Gov|Col|Sgt|Corp|Inc|Ltd|Co|Ave|Dept|Est|Vol|Vs|Jan|Feb|Mar|Apr|Aug|Sept|Oct|Nov|Dec)\.\s+$/;
```

`splitPhrases(text)` — split on `/([,;:]\s+|\s-+\s+|\u2014\s*)/`

`mergeChunks(parts, charLimit)` — combine small parts up to charLimit, break oversized parts into phrases/words

`splitSentencesEA(text)` — split on `/([\u3002\uff01\uff1f]+)/` (CJK periods/exclamation)

**Step 2: Add text preprocessing**

Before chunking, clean text:
- Remove URLs: `/https?:\/\/\S+/g` → `(link)`
- Truncate repeated chars: `(.)\1{3,}` → `$1$1$1`
- Add missing end punctuation if text ends with a word char

**Step 3: Verify**

Test with sample texts:
- "Dr. Smith went to Washington. He met Mr. Jones." → 1 chunk (not split on "Dr.")
- Very long paragraph (>1000 chars) → multiple ~200 char chunks
- Chinese text → correct CJK splitting
- Text with URLs → URLs replaced

---

## Phase 4: TTS Engine

### Task 4.1: Core playback logic

**Files:** Implement `background/tts-engine.js`

Reference: `competitors/Read Aloud A Text to Speech Voice Reader/js/tts-engines.js` for chrome.tts usage

**Step 1: State management**

```js
// In-memory cache (fast sync access) + chrome.storage.session (survives SW restart)
let playbackState = {
  state: 'STOPPED', // STOPPED | LOADING | PLAYING | PAUSED
  chunks: [],
  chunkIndex: 0,
  tabId: null,
  lang: 'en'
};

async function saveState() {
  await chrome.storage.session.set({ playbackState });
}

async function restoreState() {
  const data = await chrome.storage.session.get('playbackState');
  if (data.playbackState) playbackState = data.playbackState;
}

// Restore on module load (service worker restart)
restoreState();
```

**Step 2: Implement startPlayback(tabId)**

1. Stop any current playback
2. Set state to LOADING
3. Inject `content/extractor.js` via `chrome.scripting.executeScript`
4. Send `{ action: 'extractText' }` to content script
5. Receive text blocks + lang
6. `chunkText(blocks, lang)` → chunks array
7. Store in playbackState, save to session storage
8. Call `speakNextChunk()`

**Step 3: Implement speakNextChunk()**

```js
async function speakNextChunk() {
  if (playbackState.chunkIndex >= playbackState.chunks.length) {
    playbackState.state = 'STOPPED';
    saveState();
    notifyContentScript('stopped');
    return;
  }

  const settings = await chrome.storage.local.get(['voiceName', 'rate', 'pitch', 'volume']);
  const chunk = playbackState.chunks[playbackState.chunkIndex];

  chrome.tts.speak(chunk, {
    voiceName: settings.voiceName || undefined,
    lang: playbackState.lang,
    rate: settings.rate || 1.0,
    pitch: settings.pitch || 1.0,
    volume: settings.volume || 1.0,
    onEvent: handleTtsEvent
  });

  playbackState.state = 'PLAYING';
  saveState();
}
```

**Step 4: Implement handleTtsEvent(event)**

- `end` → increment chunkIndex, call speakNextChunk()
- `error` → log, skip to next chunk (robustness — never stop mid-text)
- `interrupted` → do nothing (we initiated the stop)

**Step 5: Implement controls**

- `pause()` → `chrome.tts.pause()`, set PAUSED
- `resume()` → `chrome.tts.resume()`, set PLAYING
- `stop()` → `chrome.tts.stop()`, set STOPPED, clear chunks
- `forward()` → `chrome.tts.stop()`, increment chunkIndex, `speakNextChunk()`
- `rewind()` → `chrome.tts.stop()`, decrement chunkIndex (min 0), `speakNextChunk()`

**Step 6: Implement getVoices()**

```js
export async function getVoices() {
  return new Promise(resolve => chrome.tts.getVoices(voices => {
    resolve(voices.map(v => ({ voiceName: v.voiceName, lang: v.lang })));
  }));
}
```

**Step 7: Verify**

- Click Play on a Wikipedia article → audio plays
- Pause → audio pauses; Resume → continues
- Stop → audio stops
- Forward/Rewind → skips chunks
- Let it play to end → stops gracefully
- Kill service worker in DevTools → restart → state recovers

---

### Task 4.2: Wire service worker message dispatch

**Files:** Modify `background/service-worker.js`

**Step 1: Implement full message handler**

Connect all message actions to tts-engine functions:
- `play` → if STOPPED, `startPlayback(sender.tab.id)`; if PAUSED, `resume()`
- `pause` → `pause()`
- `stop` → `stop()`
- `forward` → `forward()`
- `rewind` → `rewind()`
- `getState` → return `getState()`
- `getVoices` → return `getVoices()`
- `updateSettings` → save to storage

**Step 2: Wire context menu**

```js
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'read-selection' && info.selectionText) {
    await playText(info.selectionText, tab.id);
  }
});
```

**Step 3: Wire keyboard shortcuts**

```js
chrome.commands.onCommand.addListener(async (command) => {
  switch (command) {
    case 'play-pause': /* toggle */ break;
    case 'stop': stop(); break;
    case 'forward': forward(); break;
    case 'rewind': rewind(); break;
  }
});
```

**Step 4: Handle tab close**

```js
chrome.tabs.onRemoved.addListener((tabId) => {
  if (playbackState.tabId === tabId) stop();
});
```

**Step 5: Verify**

Full end-to-end: popup play → audio plays → popup pause → pauses → context menu selection → reads selection → Alt+P → toggles.

---

## Phase 5: Popup UI (Full Implementation)

### Task 5.1: Complete popup.js

**Files:** Modify `popup/popup.js`

**Step 1: Load state and voices on open**

```js
document.addEventListener('DOMContentLoaded', async () => {
  const [state, voices, settings] = await Promise.all([
    sendMessage({ action: 'getState' }),
    sendMessage({ action: 'getVoices' }),
    chrome.storage.local.get(['voiceName', 'rate', 'pitch', 'volume'])
  ]);

  updateUI(state);
  populateVoices(voices, settings.voiceName);
  applySettings(settings);
});
```

**Step 2: Button handlers**

Play button: if STOPPED → send `play` (uses activeTab to get current tab); if PAUSED → send `resume`
Pause button: send `pause`
Stop button: send `stop`
Forward/Rewind: send respective actions

**Step 3: Settings handlers**

Speed, pitch, volume sliders → save on `input` event, send `updateSettings`
Voice dropdown → save on `change`, send `updateSettings`

**Step 4: State polling**

Poll every 500ms for state updates to sync button visibility:
```js
setInterval(async () => {
  const state = await sendMessage({ action: 'getState' });
  updateUI(state);
}, 500);
```

**Step 5: Verify**

Full flow: open popup → click Play → buttons toggle to show Pause → click Pause → buttons toggle back → adjust speed → re-play → speed applied.

---

### Task 5.2: Polish popup CSS

**Files:** Modify `popup/popup.css`

**Step 1: Final styling**

- Control buttons: 36px circle, icon centered, hover effect
- Speed/pitch sliders: custom styled range inputs
- Voice dropdown: full-width, styled select
- Status text: small, muted color
- Smooth transitions on button show/hide
- Dark mode: all colors via custom properties

**Step 2: Verify**

- Toggle system dark mode → popup theme switches
- All controls fit in 360px width without overflow
- Touch-friendly sizing (min 36px touch targets)

---

## Phase 6: Floating Player Widget

### Task 6.1: Create player widget

**Files:** Create `content/player-widget.js`

**Step 1: Shadow DOM injection**

```js
function createWidget() {
  const host = document.createElement('div');
  host.id = 'tts-ext-player';
  const shadow = host.attachShadow({ mode: 'closed' });

  shadow.innerHTML = `
    <style>/* all styles scoped to shadow */</style>
    <div class="tts-widget">
      <button data-action="rewind" title="Previous">⏮</button>
      <button data-action="play-pause" title="Play/Pause">▶</button>
      <button data-action="stop" title="Stop">⏹</button>
      <button data-action="forward" title="Next">⏭</button>
      <input type="range" data-action="speed" min="0.5" max="3" step="0.1" value="1">
      <span class="speed-label">1.0x</span>
      <button data-action="close" title="Close">✕</button>
    </div>
  `;

  document.body.appendChild(host);
  return shadow;
}
```

- Position: fixed, bottom: 20px, right: 20px, z-index: 2147483647
- Collapsed state: small pill (just play/pause + close)
- Expanded state: full controls on hover/click
- Dark/light auto via `prefers-color-scheme` in shadow styles
- Inline SVG icons (no external files)

**Step 2: Wire button handlers**

Each button sends `chrome.runtime.sendMessage({ action: ... })`. Listen for state updates from background to toggle play/pause icon.

**Step 3: Show/hide logic**

- Show widget when playback starts (background sends `{ action: 'showWidget' }`)
- Hide widget when playback stops or user clicks close
- Remember close preference per session

**Step 4: Verify**

- Play from popup → widget appears on page
- Click pause on widget → audio pauses, popup reflects it
- Close widget → hides, doesn't reappear until next play
- Test on sites with various z-index/position schemes

---

## Phase 7: Text Highlighting

### Task 7.1: Implement highlighter

**Files:** Create `content/highlighter.js`

**Step 1: Store element references during extraction**

Modify `content/extractor.js` to store block-to-element mapping in a module-level array (content scripts persist for tab lifetime):
```js
window.__ttsBlockElements = blocks.map(b => b.element);
```

**Step 2: Highlight on position update**

Background sends `{ action: 'highlight', blockIndex }` when starting a new text block.

```js
function highlightBlock(index) {
  clearHighlight();
  const el = window.__ttsBlockElements?.[index];
  if (!el) return;

  el.style.outline = '2px solid var(--tts-highlight, #4a90d9)';
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
```

Using outline instead of background to avoid disrupting page layout. No `<mark>` injection to keep things simple and reversible.

**Step 3: Clean up on stop**

Listen for `{ action: 'clearHighlight' }` → `clearHighlight()`

**Step 4: Verify**

Play a long article → current block gets outlined and scrolled into view → outline moves to next block → stop → outline removed cleanly.

---

## Phase 8: Settings Persistence

### Task 8.1: Settings save/load

**Files:** Modify `popup/popup.js`, `background/tts-engine.js`

**Step 1: Define defaults**

```js
const DEFAULTS = { voiceName: '', rate: 1.0, pitch: 1.0, volume: 1.0 };
```

**Step 2: Load on popup open** (already in Task 5.1)

**Step 3: Save on every change** (already in Task 5.1)

**Step 4: Apply mid-playback**

When settings change during playback, `chrome.tts` doesn't support live updates. Instead:
- Stop current chunk: `chrome.tts.stop()`
- Re-speak same chunk with new settings
- This creates a brief interruption but is the only way (same limitation in all competitors)

**Step 5: Verify**

Change speed during playback → brief pause → continues at new speed. Close popup, reopen → settings preserved.

---

## Phase 9: Error Handling & Edge Cases

### Task 9.1: Unsupported pages

**Files:** Modify `background/service-worker.js`

**Step 1: Handle injection failures**

```js
try {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/extractor.js'] });
} catch (err) {
  return { error: 'Cannot read this page. Text-to-speech is not available on browser internal pages.' };
}
```

**Step 2: Handle empty content**

If extracted blocks are empty → return `{ error: 'No readable text found on this page.' }`

**Step 3: Show errors in popup**

Display error text in `#status` element with error styling.

**Step 4: Verify**

Try playing on `chrome://extensions` → shows error message. Try playing on empty page → shows "no text" message.

---

### Task 9.2: Tab lifecycle

**Files:** Modify `background/service-worker.js`

- `chrome.tabs.onRemoved` → stop if playing tab closes
- `chrome.tabs.onUpdated` (URL change) → stop if playing tab navigates away
- Only one playback at a time (starting new play stops previous)

**Verify:** Play on tab A, close tab A → playback stops. Play on tab A, navigate away → stops.

---

## Phase 10: CWS Assets

### Task 10.1: Extension icons

**Files:** Replace placeholder icons in `icons/`

Create a distinctive speaker/sound wave icon in teal/blue. 4 sizes: 16, 32, 48, 128px. SVG source → export PNGs.

### Task 10.2: Store listing text

**Files:** Create `store/description.txt`, `store/single-purpose.txt`, `store/permission-justifications.txt`

**Description:** SEO + LLMO optimized, keyword-rich. No "free"/"open source". Structured sections. Front-load "Text to Speech".

**Single purpose:** "Reading webpage text aloud using the browser's built-in text-to-speech engine"

**Permission justifications:**
- `activeTab`: "Access the current tab to extract visible text for reading aloud"
- `contextMenus`: "Provide 'Read aloud' option when user selects text"
- `storage`: "Save user preferences (voice, speed, pitch)"
- `tts`: "Convert text to speech using the browser's built-in voices"
- `scripting`: "Inject content script to extract readable text from the current page"

### Task 10.3: Privacy disclosures

- Remote code: No
- Data usage: "This extension does not collect, store, or transmit any user data"
- Privacy policy URL: GitHub Pages URL

---

## Phase 11: GitHub Pages

### Task 11.1: Landing page

**Files:** Create `docs/index.html`, `docs/style.css`

Static HTML/CSS landing page:
- Hero section with extension name + one-liner
- Feature highlights (5 killer features)
- Privacy section
- BTC donation address
- Link to CWS listing
- No JavaScript, no analytics, no external requests

### Task 11.2: Privacy policy

**Files:** Create `docs/privacy.html`

Simple privacy policy: "This extension does not collect, store, or transmit any personal data. All text processing occurs locally on your device using the browser's built-in text-to-speech engine. No data leaves your browser."

---

## Phase 12: Package & Final Testing

### Task 12.1: Testing checklist

Test on these sites:
- Wikipedia (long article, multiple sections)
- Reddit (dynamic content, comments)
- NYT/news site (article format)
- Gmail (email content)
- A PDF in browser
- Google Docs

Test these features:
- [ ] Play full page → completes without stopping mid-text
- [ ] Pause/Resume → works correctly
- [ ] Stop → clears state
- [ ] Forward/Rewind → skips chunks
- [ ] Context menu "Read aloud" → reads selection
- [ ] Alt+P/S/./. shortcuts → work
- [ ] Speed slider → takes effect
- [ ] Voice dropdown → lists system voices, selection persists
- [ ] Dark mode → popup + widget theme correctly
- [ ] Floating widget → appears/disappears correctly
- [ ] Text highlighting → scrolls and outlines current block
- [ ] Service worker restart → recovers state
- [ ] Tab close during playback → stops
- [ ] chrome:// page → shows error
- [ ] Empty page → shows "no text" message

### Task 12.2: Size audit

Target: <100 KiB total.
Expected breakdown:
- Icons: ~20 KiB (4 PNGs)
- JS: ~25-35 KiB (all files)
- CSS: ~3-5 KiB
- HTML: ~2-3 KiB
- manifest.json: ~1 KiB

### Task 12.3: Create ZIP

```bash
zip -r extension.zip manifest.json background/ content/ popup/ icons/ _locales/ -x "*.DS_Store"
```

Exclude: `competitors/`, `docs/`, `store/`, `.claude/`, `CLAUDE.md`, `node_modules/`

---

## Key Reference Files (competitor code)

- `competitors/Read Aloud A.../js/content/html-doc.js` — DOM traversal, findTextBlocks, Gaussian trimming
- `competitors/Read Aloud A.../js/speech.js` — LatinPunctuator, CharBreaker, WordBreaker, abbreviation regex
- `competitors/Read Aloud A.../js/tts-engines.js` — chrome.tts usage, cold-start workaround
- `competitors/Read Aloud A.../js/events.js` — service worker event wiring, context menu, shortcuts

## Anti-Patterns (NEVER do these)

- Never read `aria-hidden`, `display:none`, `script`, `style` content
- Never store playback state only in module-level variables (use chrome.storage.session)
- Never use `innerHTML` with user/page data
- Never use `eval()` or `new Function()`
- Never request `<all_urls>` or unnecessary permissions
- Never hide settings behind a disappearing gear button
- Never interrupt playback with upsell/ads
- Never silently fail on TTS errors (skip to next chunk instead)
