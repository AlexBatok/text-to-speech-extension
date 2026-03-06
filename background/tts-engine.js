/**
 * TTS playback engine — manages chrome.tts playback state and controls.
 */

import { chunkText } from './text-chunker.js';

// In-memory cache (fast sync access)
let playbackState = {
  state: 'STOPPED', // STOPPED | LOADING | PLAYING | PAUSED
  chunks: [],
  chunkIndex: 0,
  blockIndex: 0,
  blockMap: [],     // Maps chunk index → original block index (for highlighting)
  tabId: null,
  lang: 'en',
  totalChunks: 0
};

async function saveState() {
  try {
    // Only save serializable subset to session storage
    await chrome.storage.session.set({
      playbackState: {
        state: playbackState.state,
        chunks: playbackState.chunks,
        chunkIndex: playbackState.chunkIndex,
        blockIndex: playbackState.blockIndex,
        blockMap: playbackState.blockMap,
        tabId: playbackState.tabId,
        lang: playbackState.lang,
        totalChunks: playbackState.totalChunks
      }
    });
  } catch (_) {}
}

async function restoreState() {
  try {
    const data = await chrome.storage.session.get('playbackState');
    if (data.playbackState) {
      Object.assign(playbackState, data.playbackState);
      // If we were playing when SW died, mark as stopped
      // (chrome.tts state is lost on SW restart)
      if (playbackState.state === 'PLAYING' || playbackState.state === 'LOADING') {
        playbackState.state = 'PAUSED';
      }
    }
  } catch (_) {}
}

// Restore on module load (service worker restart)
restoreState();

async function pickVoiceForLang(lang) {
  const voices = await new Promise(resolve => {
    try {
      chrome.tts.getVoices(v => resolve(v || []));
    } catch (_) { resolve([]); }
  });

  if (!voices.length) return null;

  const pageLang = (lang || 'en').toLowerCase();
  const baseLang = pageLang.split('-')[0];

  // Score voices: higher = better match
  function score(v) {
    const vLang = (v.lang || '').toLowerCase();
    const vBase = vLang.split('-')[0];
    let s = 0;

    // Language match
    if (vLang === pageLang) s += 100;         // exact: "en-us" = "en-us"
    else if (vBase === baseLang) s += 50;     // base match: "en" in "en-gb"

    // Prefer Google voices
    if (/^google/i.test(v.voiceName)) s += 20;

    // Prefer non-Microsoft over Microsoft
    if (!/^microsoft/i.test(v.voiceName)) s += 5;

    // For English, prefer UK English Male; for other langs prefer male too
    if (baseLang === 'en' && v.voiceName === 'Google UK English Male') s += 10;
    else if (/male/i.test(v.voiceName) && !/female/i.test(v.voiceName)) s += 3;

    return s;
  }

  const candidates = voices
    .map(v => ({ voiceName: v.voiceName, lang: v.lang, score: score(v) }))
    .filter(v => v.score >= 50) // at least base language match
    .sort((a, b) => b.score - a.score);

  return candidates.length ? candidates[0].voiceName : null;
}

function notifyTab(action, data = {}) {
  if (!playbackState.tabId) return;
  try {
    chrome.tabs.sendMessage(playbackState.tabId, { action, ...data });
  } catch (_) {}
}

async function speakNextChunk() {
  if (playbackState.chunkIndex >= playbackState.chunks.length) {
    playbackState.state = 'STOPPED';
    playbackState.chunks = [];
    playbackState.chunkIndex = 0;
    await saveState();
    notifyTab('clearHighlight');
    notifyTab('hideWidget');
    return;
  }

  const settings = await chrome.storage.local.get(['voiceName', 'rate', 'pitch', 'volume']);
  const chunk = playbackState.chunks[playbackState.chunkIndex];

  // Send highlight update
  const blockIdx = playbackState.blockMap[playbackState.chunkIndex];
  if (blockIdx !== playbackState.blockIndex) {
    playbackState.blockIndex = blockIdx;
    notifyTab('highlight', { blockIndex: blockIdx });
  }

  const options = {
    lang: playbackState.lang,
    rate: settings.rate || 1.0,
    pitch: settings.pitch || 1.0,
    volume: settings.volume ?? 1.0,
    onEvent: handleTtsEvent
  };

  // Voice selection: explicit pick or auto-detect by page language
  const voicePref = settings.voiceName;
  if (voicePref && voicePref !== '__auto__') {
    options.voiceName = voicePref;
  } else {
    const autoVoice = await pickVoiceForLang(playbackState.lang);
    if (autoVoice) options.voiceName = autoVoice;
  }

  try {
    chrome.tts.speak(chunk, options);
    playbackState.state = 'PLAYING';
    await saveState();
  } catch (err) {
    console.error('TTS speak error:', err);
    // Skip to next chunk on error
    playbackState.chunkIndex++;
    speakNextChunk();
  }
}

function handleTtsEvent(event) {
  switch (event.type) {
    case 'end':
      playbackState.chunkIndex++;
      speakNextChunk();
      break;
    case 'error':
      console.warn('TTS error on chunk', playbackState.chunkIndex, ':', event.errorMessage);
      // Skip to next chunk — never stop mid-text
      playbackState.chunkIndex++;
      speakNextChunk();
      break;
    case 'interrupted':
      // We initiated the stop/skip, do nothing
      break;
  }
}

export async function startPlayback(tabId) {
  // Stop any current playback
  stop();

  playbackState.state = 'LOADING';
  playbackState.tabId = tabId;
  await saveState();

  try {
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/extractor.js']
    });
  } catch (err) {
    playbackState.state = 'STOPPED';
    await saveState();
    return { error: 'Cannot read this page. Text-to-speech is not available on browser internal pages.' };
  }

  // Extract text
  let response;
  try {
    response = await chrome.tabs.sendMessage(tabId, { action: 'extractText' });
  } catch (err) {
    playbackState.state = 'STOPPED';
    await saveState();
    return { error: 'Could not extract text from this page.' };
  }

  if (!response || !response.blocks || response.blocks.length === 0) {
    playbackState.state = 'STOPPED';
    await saveState();
    return { error: 'No readable text found on this page.' };
  }

  playbackState.lang = response.lang || 'en';

  // Chunk the text, building a block map
  const allChunks = [];
  const blockMap = [];

  for (let i = 0; i < response.blocks.length; i++) {
    const blockChunks = chunkText([response.blocks[i]], playbackState.lang);
    for (const chunk of blockChunks) {
      allChunks.push(chunk);
      blockMap.push(i);
    }
  }

  playbackState.chunks = allChunks;
  playbackState.blockMap = blockMap;
  playbackState.totalChunks = allChunks.length;
  playbackState.chunkIndex = 0;
  playbackState.blockIndex = -1;
  await saveState();

  // Inject widget
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/player-widget.js']
    });
    notifyTab('showWidget');
  } catch (_) {}

  await speakNextChunk();
  return { success: true };
}

export function pause() {
  if (playbackState.state !== 'PLAYING') return;
  try { chrome.tts.pause(); } catch (_) {}
  playbackState.state = 'PAUSED';
  saveState();
}

export function resume() {
  if (playbackState.state !== 'PAUSED') return;
  try { chrome.tts.resume(); } catch (_) {}
  playbackState.state = 'PLAYING';
  saveState();
}

export function stop() {
  try { chrome.tts.stop(); } catch (_) {}
  playbackState.state = 'STOPPED';
  playbackState.chunks = [];
  playbackState.chunkIndex = 0;
  playbackState.totalChunks = 0;
  notifyTab('clearHighlight');
  notifyTab('hideWidget');
  const oldTabId = playbackState.tabId;
  playbackState.tabId = null;
  saveState();
}

export function forward() {
  if (playbackState.state === 'STOPPED') return;
  try { chrome.tts.stop(); } catch (_) {}
  playbackState.chunkIndex = Math.min(playbackState.chunkIndex + 1, playbackState.chunks.length - 1);
  speakNextChunk();
}

export function rewind() {
  if (playbackState.state === 'STOPPED') return;
  try { chrome.tts.stop(); } catch (_) {}
  playbackState.chunkIndex = Math.max(playbackState.chunkIndex - 1, 0);
  speakNextChunk();
}

export function getState() {
  return {
    state: playbackState.state,
    chunkIndex: playbackState.chunkIndex,
    totalChunks: playbackState.totalChunks,
    tabId: playbackState.tabId
  };
}

export async function getVoices() {
  return new Promise(resolve => {
    try {
      chrome.tts.getVoices(voices => {
        resolve((voices || []).map(v => ({ voiceName: v.voiceName, lang: v.lang })));
      });
    } catch (_) {
      resolve([]);
    }
  });
}

export async function playText(text, tabId) {
  stop();

  playbackState.state = 'LOADING';
  playbackState.tabId = tabId;

  // Try to detect page language
  let lang = 'en';
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/extractor.js'] });
    const resp = await chrome.tabs.sendMessage(tabId, { action: 'getLang' });
    if (resp?.lang) lang = resp.lang;
  } catch (_) {}

  playbackState.lang = lang;
  const chunks = chunkText([text], lang);
  playbackState.chunks = chunks;
  playbackState.blockMap = chunks.map(() => 0);
  playbackState.totalChunks = chunks.length;
  playbackState.chunkIndex = 0;
  playbackState.blockIndex = -1;
  await saveState();

  await speakNextChunk();
  return { success: true };
}
