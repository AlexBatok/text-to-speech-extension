# Text-to-Speech Chrome Extension

## Project Overview

Chrome extension in the text-to-speech niche. Uses the Chrome TTS API (`chrome.tts`) for fully offline, privacy-first text reading. Ready for Chrome Web Store publication.

## Tech Stack

- **Language:** Vanilla JavaScript (ES2022+)
- **Styling:** Vanilla CSS with custom properties, no preprocessors
- **Manifest:** Chrome Extension Manifest V3
- **TTS Engine:** Chrome TTS API (`chrome.tts`, built-in, no external services)
- **Build:** None — plain files, no bundler, no transpiler
- **Landing/Privacy:** GitHub Pages (static HTML/CSS)

## Project Structure

```
├── manifest.json          # Extension manifest (MV3)
├── popup/                 # Popup UI (HTML, CSS, JS)
├── content/               # Content scripts (page interaction)
├── background/            # Service worker
├── icons/                 # Extension icons (16, 32, 48, 128)
├── competitors/           # Competitor source code for reference
├── docs/                  # Landing page, privacy policy (GitHub Pages)
└── store/                 # CWS assets (screenshots, descriptions, icons)
```

## Key Constraints

### Privacy
- Zero data collection — no analytics, no tracking, no telemetry
- No external network requests — everything runs locally
- No remote code loading — all code bundled in extension
- CWS privacy disclosures must be 100% accurate

### CWS Policy
- No "free", "open source" in any user-facing text
- Donation link in popup OK (small, non-intrusive) — crypto addresses on GitHub landing page
- Minimum permissions — justify every permission requested
- Single purpose declaration required
- All store listing fields SEO and LLMO optimized

### Code Quality
- No eval(), no new Function(), no innerHTML with user data
- Service worker state in chrome.storage, never module-level variables
- All chrome API calls wrapped in try/catch
- Async message handlers must return true
- CSS custom properties for all colors, dark mode support via prefers-color-scheme
- System font stack only — no external fonts

## Competitor Analysis

Full analysis: `docs/competitor-analysis.md`
Product brief: `docs/product-brief.md`
Competitor source code: `competitors/` folder

### Top 3 Competitors (source code in competitors/)
1. **Read Aloud** (6M users) — ID: `hdhinadidafjejdhmfkjgnolgimiaplp` — 439 KiB, freemium, buggy text parsing
2. **Speechify** (1M users) — ID: `ljflmlehinmoeknoonhibbjpldiijjmm` — 22.6 MiB, expensive sub, bloated
3. **Read Aloud #2** (600K users) — ID: `npdkkcjlmhcnnaoobfdjndibfkkhhdfn` — 1.6 MiB, aggressive upsell during playback

### Our Differentiators
- <100 KiB target (225x lighter than Speechify)
- Zero data collection, fully offline (Web Speech API)
- No account, no limits, no upsell interruptions
- Rock-solid text parsing (fix #1 competitor complaint)
- Floating mini-player with always-accessible controls

### DB for further queries
Path: `E:\Desktop\расширения\crawl\new\cws.db` (239K extensions)
Table: `extensions` (id, slug, name, url, rating, rating_count, user_count, category, last_updated, date_added, version, size, developer, developer_email, developer_url, featured, scraped_at)

## CWS Store Listing

- **Category:** `make_chrome_yours/accessibility`
- **Single purpose:** "Reading webpage text aloud using the browser's built-in text-to-speech engine"
- **Privacy:** Zero data collection, no remote code, no network requests
- **Name:** Front-load "Text to Speech" keywords
- **Screenshots:** 5 infographic-style
- **Promo tiles:** Small + Marquee
- **Homepage:** GitHub Pages landing
- **Support:** GitHub Issues link

## Deliverables

1. Production-ready extension in ZIP archive
2. GitHub repository with landing page and privacy policy on Pages
3. All CWS store listing fields prepared:
   - Store Listing: description, icon, 5 screenshots with infographics, promo tiles
   - Privacy: single purpose, permission justification, remote code declaration, data usage, privacy policy URL
4. BTC donation link on landing page

## Commands

```bash
# No build step needed — load unpacked in chrome://extensions
# Test: Enable Developer Mode > Load Unpacked > select project root
```
