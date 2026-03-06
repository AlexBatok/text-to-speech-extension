import { startPlayback, pause, resume, stop, forward, rewind, getState, getVoices, playText } from './tts-engine.js';

// Cold-start workaround: stop any leftover speech
try { chrome.tts.stop(); } catch (_) {}

// Context menu setup
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: 'read-selection',
    title: 'Read aloud',
    contexts: ['selection']
  });

  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'https://alexbatok.github.io/text-to-speech-extension/' });
  }
});

// Context menu handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'read-selection' && info.selectionText) {
    try {
      await playText(info.selectionText, tab.id);
    } catch (err) {
      console.error('Context menu playback failed:', err);
    }
  }
});

// Keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  try {
    const state = await getState();
    switch (command) {
      case 'play-pause':
        if (state.state === 'PLAYING') pause();
        else if (state.state === 'PAUSED') resume();
        else {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab) await startPlayback(tab.id);
        }
        break;
      case 'stop': stop(); break;
      case 'forward': forward(); break;
      case 'rewind': rewind(); break;
    }
  } catch (err) {
    console.error('Command handler error:', err);
  }
});

// Message dispatcher
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  function reply(data) {
    try { sendResponse(data); } catch (_) {}
  }

  (async () => {
    try {
      switch (msg.action) {
        case 'play': {
          const currentState = await getState();
          if (currentState.state === 'PAUSED') {
            resume();
            reply({ success: true });
          } else {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
              const result = await startPlayback(tab.id);
              reply(result || { success: true });
            } else {
              reply({ error: 'No active tab found.' });
            }
          }
          break;
        }
        case 'pause':
          pause();
          reply({ success: true });
          break;
        case 'resume':
          resume();
          reply({ success: true });
          break;
        case 'stop':
          stop();
          reply({ success: true });
          break;
        case 'forward':
          forward();
          reply({ success: true });
          break;
        case 'rewind':
          rewind();
          reply({ success: true });
          break;
        case 'getState':
          reply(await getState());
          break;
        case 'getVoices':
          reply(await getVoices());
          break;
        case 'updateSettings':
          await chrome.storage.local.set(msg.settings);
          reply({ success: true });
          break;
        default:
          reply({ error: 'Unknown action' });
      }
    } catch (err) {
      console.error('Message handler error:', err);
      reply({ error: err.message });
    }
  })();
  return true;
});

// Stop playback when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  const state = await getState();
  if (state.tabId === tabId) stop();
});

// Stop playback when tab navigates away
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    const state = await getState();
    if (state.tabId === tabId) stop();
  }
});

console.log('Service worker registered');
