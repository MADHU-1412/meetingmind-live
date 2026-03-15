// MeetingMind Live — background.js
// Implements tabCapture so we hear ALL speakers, not just the local mic.

chrome.runtime.onInstalled.addListener(() => {
  console.log('MeetingMind Live installed');
});

// When content.js requests tab audio capture
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_TAB_CAPTURE') {
    startTabCapture(sender.tab.id, sendResponse);
    return true; // keep channel open for async response
  }
  if (msg.type === 'STOP_TAB_CAPTURE') {
    stopTabCapture();
    sendResponse({ ok: true });
  }
});

let captureStream = null;
let offscreenDoc = null;

async function startTabCapture(tabId, sendResponse) {
  try {
    // Get a MediaStream of the tab's audio+video output
    const streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(id);
      });
    });

    // Send the streamId back to content.js so it can call
    // navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } })
    sendResponse({ ok: true, streamId });
  } catch (err) {
    console.error('tabCapture error:', err);
    sendResponse({ ok: false, error: err.message });
  }
}

function stopTabCapture() {
  // Content script owns the actual stream and will stop its tracks
  console.log('Tab capture stop requested');
}