# Product Brief: Text-to-Speech Chrome Extension

## One-Liner

A lightweight, privacy-first Chrome extension that reads any webpage text aloud with natural voices — no account, no limits, no interruptions.

## 5 Killer Features (fixing competitor complaints)

### 1. Rock-Solid Text Parsing
**Fixes:** "Stops after 3 lines", "skips paragraphs", "reads hidden elements"
- Smart DOM traversal that respects visual hierarchy
- Never reads aria-hidden, display:none, or script content
- Handles lists, tables, headings correctly — not as "colon then..."
- Graceful handling of dynamic content (SPAs, infinite scroll)

### 2. Zero-Friction Playback Controls
**Fixes:** "Can't find settings", "gear only visible when stopped", "pause doesn't work"
- Floating mini-player on page with play/pause/skip/speed
- Keyboard shortcuts that always work (even when popup closed)
- Speed control (0.5x-3x) accessible during playback
- Visual text highlighting follows along in real-time

### 3. Truly No Limits
**Fixes:** "Hidden word caps", "upsell during playback", "bad free voices"
- No word limits, no premium tier, no upsell interruptions
- Uses browser's built-in voices (already installed, already good)
- All features available to everyone, always

### 4. Works Everywhere, Every Time
**Fixes:** "Doesn't work on Reddit", "broke after update", "can't read PDFs"
- Consistent behavior across all websites
- PDF support via content script injection
- Google Docs, email, news sites — same reliable experience
- Offline-capable (Web Speech API is local)

### 5. Instant Language Switching
**Fixes:** "Stuck with browser language", "wrong language detected", "Unrecognized Language En"
- Auto-detect text language per paragraph
- One-click language/voice switching without restarting
- Remember per-site language preferences

## Anti-Features (what we do NOT do)

- No cloud voices / external API calls (privacy, simplicity)
- No account / login / registration
- No analytics / tracking / telemetry
- No premium tier / subscription / paywall
- No AI features (summarization, Q&A)
- No cross-device sync
- No voice typing / STT
- No celebrity voices
- No screenshots-to-audio
- No remote code loading

## Target Audience

1. **Primary:** People with ADHD, dyslexia, or visual impairments who need text read aloud daily
2. **Secondary:** Students who listen to study materials while multitasking
3. **Tertiary:** Professionals who consume articles/docs while doing other tasks

## Monetization

- **Model:** Donation-based (BTC wallet link on GitHub landing page)
- **No in-extension monetization** — CWS policy compliant
- **No premium features** — everything included

## Competitive Positioning

| Factor | Read Aloud (6M) | Speechify (1M) | Ours |
|--------|-----------------|-----------------|------|
| Size | 439 KiB | 22.6 MiB | <100 KiB target |
| Price | Freemium | Expensive sub | Donation |
| Account | Optional | Required | None |
| Network | Cloud voices | Cloud required | Fully offline |
| Privacy | Unclear | Collects data | Zero collection |
| Voices | 40+ (cloud) | 1000+ (cloud) | System voices |
| Reliability | Buggy parsing | Post-update breaks | Solid parsing |

## Tech Decisions

- **Web Speech API only** — no external dependencies, fully offline, zero privacy risk
- **Vanilla JS** — no build step, no framework, minimal attack surface
- **<100 KiB** — 225x lighter than Speechify
- **MV3 service worker** — modern Chrome extension architecture
- **CSS custom properties** — automatic dark mode, theme consistency
- **System fonts only** — no network requests for fonts

## CWS Category

`make_chrome_yours/accessibility` — matches top competitors, targets right audience

## Store Listing Strategy

- **Name:** Front-load "Text to Speech" for search
- **Description:** SEO + LLMO optimized, keyword-rich natural language
- **Screenshots:** 5 infographic-style showing key workflows
- **Privacy:** "This extension does not collect or transmit any data" — verifiable claim
- **Single purpose:** "Reading webpage text aloud using the browser's built-in text-to-speech engine"
