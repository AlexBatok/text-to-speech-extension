const $ = (sel) => document.querySelector(sel);

function sendMessage(msg) {
  return chrome.runtime.sendMessage(msg);
}

let currentTabId = null;

function updateUI(state) {
  if (!state) return;

  const isPlaying = state.state === 'PLAYING';
  const isPaused = state.state === 'PAUSED';
  const isActive = isPlaying || isPaused;
  const onDifferentTab = isActive && state.tabId && state.tabId !== currentTabId;

  $('#play').classList.toggle('hidden', isPlaying);
  $('#pause').classList.toggle('hidden', !isPlaying);
  $('#tab-conflict').classList.toggle('hidden', !onDifferentTab);

  const status = $('#status');
  if (state.error) {
    status.textContent = state.error;
    status.classList.add('error');
  } else if (onDifferentTab) {
    status.textContent = '';
    status.classList.remove('error');
  } else if (isPlaying) {
    status.textContent = `Reading ${state.chunkIndex + 1} of ${state.totalChunks}`;
    status.classList.remove('error');
  } else if (isPaused) {
    status.textContent = 'Paused';
    status.classList.remove('error');
  } else {
    status.textContent = '';
    status.classList.remove('error');
  }
}

const AUTO_VOICE = '__auto__';

function sortVoices(voices) {
  const isGoogle = (v) => /^google/i.test(v.voiceName);
  const isMicrosoft = (v) => /^microsoft/i.test(v.voiceName);

  return [...voices].sort((a, b) => {
    const aGoogle = isGoogle(a), bGoogle = isGoogle(b);
    const aMicrosoft = isMicrosoft(a), bMicrosoft = isMicrosoft(b);

    if (aGoogle && !bGoogle) return -1;
    if (!aGoogle && bGoogle) return 1;
    if (aMicrosoft && !bMicrosoft) return 1;
    if (!aMicrosoft && bMicrosoft) return -1;
    return a.voiceName.localeCompare(b.voiceName);
  });
}

function populateVoices(voices, selectedVoice) {
  const select = $('#voice');
  select.replaceChildren();

  // Auto option is always first
  const autoOpt = document.createElement('option');
  autoOpt.value = AUTO_VOICE;
  autoOpt.textContent = 'Auto (detect language)';
  select.appendChild(autoOpt);

  if (!voices || !voices.length) return;

  const sorted = sortVoices(voices);

  // Default to Auto if nothing saved
  const effectiveSelected = selectedVoice || AUTO_VOICE;
  if (!selectedVoice) {
    chrome.storage.local.set({ voiceName: AUTO_VOICE });
  }

  if (effectiveSelected === AUTO_VOICE) autoOpt.selected = true;

  for (const voice of sorted) {
    const opt = document.createElement('option');
    opt.value = voice.voiceName;
    opt.textContent = `${voice.voiceName} (${voice.lang || 'unknown'})`;
    if (voice.voiceName === effectiveSelected) opt.selected = true;
    select.appendChild(opt);
  }
}

function applySettings(settings) {
  if (settings.rate != null) {
    $('#speed').value = settings.rate;
    $('#speed-value').textContent = `${parseFloat(settings.rate).toFixed(1)}x`;
  }
  if (settings.pitch != null) {
    $('#pitch').value = settings.pitch;
    $('#pitch-value').textContent = parseFloat(settings.pitch).toFixed(1);
  }
  if (settings.volume != null) {
    $('#volume').value = settings.volume;
    $('#volume-value').textContent = `${Math.round(settings.volume * 100)}%`;
  }
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab?.id ?? null;

    const [state, voices, settings] = await Promise.all([
      sendMessage({ action: 'getState' }),
      sendMessage({ action: 'getVoices' }),
      chrome.storage.local.get(['voiceName', 'rate', 'pitch', 'volume'])
    ]);

    updateUI(state);
    populateVoices(voices, settings.voiceName);
    applySettings(settings);
    $('#rate-link').href = `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`;
  } catch (_) {}
});

// Play/Pause — always works, even for other tab's playback
$('#play').addEventListener('click', async () => {
  const state = await sendMessage({ action: 'getState' });
  if (state.state === 'PAUSED') {
    await sendMessage({ action: 'resume' });
  } else if (state.state === 'STOPPED') {
    const result = await sendMessage({ action: 'play' });
    if (result?.error) {
      updateUI({ state: 'STOPPED', error: result.error });
    }
  }
});

// Read this page — stop previous tab, start reading current page
$('#read-this-tab').addEventListener('click', async () => {
  await sendMessage({ action: 'stop' });
  const result = await sendMessage({ action: 'play' });
  if (result?.error) {
    updateUI({ state: 'STOPPED', error: result.error });
  }
});

// Pause
$('#pause').addEventListener('click', () => sendMessage({ action: 'pause' }));

// Stop
$('#stop').addEventListener('click', () => sendMessage({ action: 'stop' }));

// Forward / Rewind
$('#forward').addEventListener('click', () => sendMessage({ action: 'forward' }));
$('#rewind').addEventListener('click', () => sendMessage({ action: 'rewind' }));

// Voice selection
$('#voice').addEventListener('change', (e) => {
  const voiceName = e.target.value;
  chrome.storage.local.set({ voiceName });
  sendMessage({ action: 'updateSettings', settings: { voiceName } });
});

// Speed slider
$('#speed').addEventListener('input', (e) => {
  const rate = parseFloat(e.target.value);
  $('#speed-value').textContent = `${rate.toFixed(1)}x`;
  chrome.storage.local.set({ rate });
  sendMessage({ action: 'updateSettings', settings: { rate } });
});

// Pitch slider
$('#pitch').addEventListener('input', (e) => {
  const pitch = parseFloat(e.target.value);
  $('#pitch-value').textContent = pitch.toFixed(1);
  chrome.storage.local.set({ pitch });
  sendMessage({ action: 'updateSettings', settings: { pitch } });
});

// Volume slider
$('#volume').addEventListener('input', (e) => {
  const volume = parseFloat(e.target.value);
  $('#volume-value').textContent = `${Math.round(volume * 100)}%`;
  chrome.storage.local.set({ volume });
  sendMessage({ action: 'updateSettings', settings: { volume } });
});

// Poll for state updates
setInterval(async () => {
  try {
    const state = await sendMessage({ action: 'getState' });
    updateUI(state);
  } catch (_) {
    // Service worker may be inactive
  }
}, 1000);
