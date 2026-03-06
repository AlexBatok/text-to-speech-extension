(() => {
  'use strict';

  // Prevent double injection
  if (document.getElementById('tts-ext-player')) return;

  const host = document.createElement('div');
  host.id = 'tts-ext-player';
  const shadow = host.attachShadow({ mode: 'closed' });

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      .widget {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border-radius: 24px;
        background: #1a1a1a;
        color: #fff;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        font-size: 13px;
        transition: opacity 0.2s;
      }

      @media (prefers-color-scheme: light) {
        .widget {
          background: #ffffff;
          color: #1a1a1a;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        }
        .widget button { color: #1a1a1a; }
        .widget button:hover { background: #f0f0f0; }
        .speed-label { color: #666; }
      }

      .widget.hidden { display: none; }

      button {
        background: none;
        border: none;
        color: #fff;
        cursor: pointer;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        padding: 0;
        transition: background 0.15s;
      }

      button:hover { background: rgba(255,255,255,0.15); }

      .btn-play-pause {
        width: 32px;
        height: 32px;
        background: #2abfbf;
        color: #fff !important;
      }

      .btn-play-pause:hover { background: #22a3a3; }

      input[type="range"] {
        -webkit-appearance: none;
        width: 60px;
        height: 3px;
        border-radius: 2px;
        background: #555;
        outline: none;
      }

      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #2abfbf;
        cursor: pointer;
      }

      .speed-label {
        font-size: 11px;
        color: #999;
        min-width: 28px;
        text-align: center;
      }

      .close {
        font-size: 16px;
        opacity: 0.6;
      }
      .close:hover { opacity: 1; }
    </style>

    <div class="widget hidden">
      <button data-action="rewind" title="Previous">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
      </button>
      <button class="btn-play-pause" data-action="play-pause" title="Play/Pause">
        <svg class="icon-play" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        <svg class="icon-pause" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display:none"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
      </button>
      <button data-action="stop" title="Stop">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
      </button>
      <button data-action="forward" title="Next">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
      </button>
      <input type="range" data-action="speed" min="0.5" max="3" step="0.1" value="1" title="Speed">
      <span class="speed-label">1.0x</span>
      <button class="close" data-action="close" title="Close">&times;</button>
    </div>
  `;

  document.body.appendChild(host);

  const widget = shadow.querySelector('.widget');
  const playIcon = shadow.querySelector('.icon-play');
  const pauseIcon = shadow.querySelector('.icon-pause');
  const speedSlider = shadow.querySelector('[data-action="speed"]');
  const speedLabel = shadow.querySelector('.speed-label');

  let closedThisSession = false;

  function show() {
    if (closedThisSession) return;
    widget.classList.remove('hidden');
  }

  function hide() {
    widget.classList.add('hidden');
  }

  function updatePlayPause(isPlaying) {
    playIcon.style.display = isPlaying ? 'none' : '';
    pauseIcon.style.display = isPlaying ? '' : 'none';
  }

  // Load current speed
  chrome.storage.local.get(['rate'], (data) => {
    if (data.rate) {
      speedSlider.value = data.rate;
      speedLabel.textContent = `${parseFloat(data.rate).toFixed(1)}x`;
    }
  });

  function safeSend(msg, cb) {
    if (!chrome.runtime?.id) { hide(); return; }
    try { chrome.runtime.sendMessage(msg, cb); } catch (_) { hide(); }
  }

  // Button handlers
  widget.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const action = btn.dataset.action;
    switch (action) {
      case 'play-pause':
        safeSend({ action: 'getState' }, (state) => {
          if (chrome.runtime.lastError) return;
          if (state?.state === 'PLAYING') {
            safeSend({ action: 'pause' });
          } else {
            safeSend({ action: 'play' });
          }
        });
        break;
      case 'stop':
        safeSend({ action: 'stop' });
        break;
      case 'forward':
        safeSend({ action: 'forward' });
        break;
      case 'rewind':
        safeSend({ action: 'rewind' });
        break;
      case 'close':
        closedThisSession = true;
        hide();
        break;
    }
  });

  // Speed slider
  speedSlider.addEventListener('input', (e) => {
    const rate = parseFloat(e.target.value);
    speedLabel.textContent = `${rate.toFixed(1)}x`;
    try { chrome.storage.local.set({ rate }); } catch (_) {}
    safeSend({ action: 'updateSettings', settings: { rate } });
  });

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.action) {
      case 'showWidget':
        show();
        updatePlayPause(true);
        break;
      case 'hideWidget':
        hide();
        break;
      case 'stateChanged':
        if (msg.state === 'PLAYING') updatePlayPause(true);
        else if (msg.state === 'PAUSED') updatePlayPause(false);
        else if (msg.state === 'STOPPED') hide();
        break;
    }
  });

  // Poll state for play/pause icon sync
  const pollId = setInterval(() => {
    if (!chrome.runtime?.id) { clearInterval(pollId); hide(); return; }
    if (widget.classList.contains('hidden')) return;
    try {
      chrome.runtime.sendMessage({ action: 'getState' }, (state) => {
        if (chrome.runtime.lastError) return;
        if (state?.state === 'PLAYING') updatePlayPause(true);
        else if (state?.state === 'PAUSED') updatePlayPause(false);
        else if (state?.state === 'STOPPED') hide();
      });
    } catch (_) { clearInterval(pollId); hide(); }
  }, 1000);
})();
