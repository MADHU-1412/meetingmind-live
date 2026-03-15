// MeetingMind Live — content.js
// Runs on meet.google.com. Auto-starts, captures all speakers via tabCapture + mic merge.

const BACKEND = 'wss://meetingmind-live-743060312558.us-central1.run.app/ws/';

let ws = null;
let sessionId = 'meet_' + Date.now().toString(36);
let micStream = null;
let tabStream = null;
let mergedStream = null;
let audioContext = null;
let mediaRecorder = null;
let currentPhase = 'idle'; // idle | briefing | active | ending | done
let currentCard = null;
let autoStarted = false;

// ─── OVERLAY CREATION ──────────────────────────────────────────────────────

function createOverlay() {
  if (document.getElementById('mm-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'mm-overlay';

  // Header (drag handle)
  const header = document.createElement('div');
  header.id = 'mm-header';

  const pulse = document.createElement('div');
  pulse.id = 'mm-pulse';

  const titleEl = document.createElement('span');
  titleEl.id = 'mm-title';
  titleEl.textContent = 'MeetingMind';

  const status = document.createElement('span');
  status.id = 'mm-status';
  status.textContent = 'connecting...';

  const phaseTag = document.createElement('span');
  phaseTag.id = 'mm-phase-tag';

  const toggle = document.createElement('button');
  toggle.id = 'mm-toggle';
  toggle.textContent = '−';
  toggle.addEventListener('click', () => {
    const body = document.getElementById('mm-body');
    if (body.style.display === 'none') {
      body.style.display = 'block';
      toggle.textContent = '−';
    } else {
      body.style.display = 'none';
      toggle.textContent = '+';
    }
  });

  header.appendChild(pulse);
  header.appendChild(titleEl);
  header.appendChild(phaseTag);
  header.appendChild(status);
  header.appendChild(toggle);

  // Body
  const body = document.createElement('div');
  body.id = 'mm-body';

  // Single insight card slot (replaces alert stack)
  const cardSlot = document.createElement('div');
  cardSlot.id = 'mm-card-slot';

  // Standby state
  const standby = document.createElement('div');
  standby.id = 'mm-standby';
  standby.textContent = 'Initializing...';
  cardSlot.appendChild(standby);

  // Footer
  const footer = document.createElement('div');
  footer.id = 'mm-footer';

  const endBtn = document.createElement('button');
  endBtn.id = 'mm-end-btn';
  endBtn.textContent = '■ End Meeting';
  endBtn.style.display = 'none';
  endBtn.addEventListener('click', mmEndMeeting);
  footer.appendChild(endBtn);

  body.appendChild(cardSlot);
  body.appendChild(footer);
  overlay.appendChild(header);
  overlay.appendChild(body);
  document.body.appendChild(overlay);

  makeDraggable(overlay, header);
}

function makeDraggable(el, handle) {
  let x = 0, y = 0, mx = 0, my = 0;
  handle.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    mx = e.clientX; my = e.clientY;
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('mousemove', doDrag);
  });
  function doDrag(e) {
    x = mx - e.clientX; y = my - e.clientY;
    mx = e.clientX; my = e.clientY;
    el.style.top = (el.offsetTop - y) + 'px';
    el.style.right = 'auto';
    el.style.left = (el.offsetLeft - x) + 'px';
  }
  function stopDrag() {
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('mousemove', doDrag);
  }
}

// ─── PHASE TAG ─────────────────────────────────────────────────────────────

function setPhase(phase) {
  currentPhase = phase;
  const tag = document.getElementById('mm-phase-tag');
  if (!tag) return;

  const labels = {
    idle: '',
    connecting: 'connecting',
    briefing: 'P1 · briefing',
    active: 'P2 · live',
    ending: 'P3 · executing',
    done: 'done'
  };
  const colors = {
    briefing: '#4ade80',
    active: '#4ade80',
    ending: '#fbbf24',
    done: '#60a5fa'
  };

  tag.textContent = labels[phase] || '';
  tag.style.color = colors[phase] || 'rgba(226,245,232,0.4)';

  // Show/hide end button
  const endBtn = document.getElementById('mm-end-btn');
  if (endBtn) {
    endBtn.style.display = (phase === 'active') ? 'block' : 'none';
  }
}

// ─── WEBSOCKET ─────────────────────────────────────────────────────────────

function connectWS() {
  try {
    ws = new WebSocket(BACKEND + sessionId);

    ws.onopen = () => {
      const s = document.getElementById('mm-status');
      const p = document.getElementById('mm-pulse');
      if (s) { s.textContent = 'live'; s.style.color = '#4ade80'; }
      if (p) p.style.background = '#4ade80';
      setStandby('Detecting meeting...');
      setPhase('connecting');
      autoDetectAndStart();
    };

    ws.onmessage = e => {
      try { handleMessage(JSON.parse(e.data)); } catch (err) { }
    };

    ws.onclose = () => {
      const s = document.getElementById('mm-status');
      if (s) { s.textContent = 'reconnecting...'; s.style.color = ''; }
      if (currentPhase !== 'done') {
        setTimeout(connectWS, 3000);
      }
    };

    ws.onerror = () => setTimeout(connectWS, 3000);
  } catch (e) {
    setTimeout(connectWS, 3000);
  }
}

// ─── AUTO-DETECT MEETING ───────────────────────────────────────────────────

function autoDetectAndStart() {
  if (autoStarted) return;

  // Extract meeting info from the page
  const meetingTitle = extractMeetingTitle();
  const attendees = extractAttendees();

  if (ws && ws.readyState === WebSocket.OPEN) {
    autoStarted = true;

    ws.send(JSON.stringify({
      type: 'meeting_start',
      meeting_info: {
        title: meetingTitle,
        agenda: '',
        attendees: attendees
      }
    }));

    document.getElementById('mm-end-btn').style.display = 'block';
    startAudioCapture();
  }
}

function extractMeetingTitle() {
  // Google Meet puts the meeting name in a few places
  const selectors = [
    '[data-meeting-title]',
    'c-wiz[data-id] [jsname="r4nke"]',
    '[jsname="HlFzId"]',
    'span[jsname="NtNlsc"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) return el.textContent.trim();
  }
  // Fallback: use tab title or URL code
  const titleEl = document.title;
  if (titleEl && titleEl !== 'Google Meet') return titleEl.replace(' - Google Meet', '');
  const code = window.location.pathname.replace('/', '');
  return code ? `Meet: ${code}` : 'Google Meet';
}

function extractAttendees() {
  // Try to read participant names from the sidebar
  const attendeeEls = document.querySelectorAll('[jsname="EwRGef"], [data-participant-id] [jsname="r9vdVb"]');
  const names = Array.from(attendeeEls)
    .map(el => el.textContent.trim())
    .filter(n => n && n.length > 1 && n !== 'You');
  return [...new Set(names)].slice(0, 10); // dedupe, max 10
}

// ─── MESSAGE HANDLER ───────────────────────────────────────────────────────

function handleMessage(msg) {
  switch (msg.type) {
    case 'phase1_starting':
      setPhase('briefing');
      setStandby('Preparing briefing...');
      break;

    case 'phase1_complete':
      setPhase('active');
      showBriefingCard(msg.briefing);
      break;

    case 'overlay_alert':
      showInsightCard(msg.alert);
      break;

    case 'task_logged':
      flashStandby(`✓ Task logged: ${msg.task?.description || ''}`, '#4ade80');
      break;

    case 'phase3_starting':
      setPhase('ending');
      setStandby('Generating summary...');
      break;

    case 'phase3_complete':
      setPhase('done');
      showSummaryCard(msg.result);
      break;

    case 'error':
      showInsightCard({
        show_overlay: true,
        layer: 'error',
        title: 'Error',
        message: msg.message || 'Something went wrong',
        urgency: 'high'
      });
      break;
  }
}

// ─── BRIEFING CARD ─────────────────────────────────────────────────────────

function showBriefingCard(b) {
  if (!b) return;

  const watchList = (b.watch_out_for || []).map(w =>
    `<div class="mm-watch-item">⚑ ${w}</div>`
  ).join('');

  const contextList = (b.key_context || []).map(c =>
    `<div class="mm-context-item">▸ ${c}</div>`
  ).join('');

  const html = `
    <div class="mm-briefing-card" id="mm-current-card">
      <div class="mm-card-stripe mm-stripe-green"></div>
      <div class="mm-card-label" style="color:#4ade80">Pre-Meeting Briefing</div>
      <div class="mm-card-spoken">${b.spoken_brief || 'Meeting starting.'}</div>
      ${watchList ? `<div class="mm-section-head" style="color:#fbbf24">Watch out for</div>${watchList}` : ''}
      ${contextList ? `<div class="mm-section-head">Key context</div>${contextList}` : ''}
      <div class="mm-card-footer">
        <button class="mm-card-btn" onclick="dismissCurrentCard()">Got it ✓</button>
      </div>
    </div>
  `;

  setCardSlot(html);
}

// ─── SINGLE INSIGHT CARD ───────────────────────────────────────────────────

function showInsightCard(alert) {
  if (!alert?.show_overlay) return;

  const layerColors = {
    fact_shield: '#f87171',
    question_anticipator: '#60a5fa',
    negotiation: '#fbbf24',
    task_logger: '#4ade80',
    error: '#f87171'
  };
  const color = layerColors[alert.layer] || '#4ade80';

  const layerLabel = {
    fact_shield: 'Fact Shield',
    question_anticipator: 'Question Anticipator',
    negotiation: 'Negotiation Assistant',
    task_logger: 'Task Assigned',
    error: 'Error'
  }[alert.layer] || alert.layer;

  const taskBtn = (alert.layer === 'task_logger' && alert.task)
    ? `<button class="mm-card-btn mm-card-btn-confirm" onclick="confirmTask(${JSON.stringify(alert.task || {}).replace(/"/g, '&quot;')})">✓ Confirm Task</button>`
    : '';

  const sourceHtml = alert.source
    ? `<div class="mm-card-source">📎 ${alert.source}</div>`
    : '';

  const html = `
    <div class="mm-insight-card" id="mm-current-card">
      <div class="mm-card-stripe" style="background:${color}"></div>
      <div class="mm-card-label" style="color:${color}">${layerLabel}</div>
      <div class="mm-card-title">${alert.title || 'Alert'}</div>
      <div class="mm-card-body">${alert.message || ''}</div>
      ${sourceHtml}
      <div class="mm-card-footer">
        ${taskBtn}
        <button class="mm-card-btn" onclick="dismissCurrentCard()">Dismiss</button>
      </div>
    </div>
  `;

  setCardSlot(html);

  // Auto-dismiss medium/low urgency alerts
  if (alert.urgency !== 'high') {
    const cardId = Date.now();
    document.getElementById('mm-current-card')?.setAttribute('data-id', cardId);
    setTimeout(() => {
      const card = document.getElementById('mm-current-card');
      if (card && card.getAttribute('data-id') == cardId) {
        dismissCurrentCard();
      }
    }, 12000);
  }
}

// ─── SUMMARY CARD ──────────────────────────────────────────────────────────

function showSummaryCard(r) {
  if (!r) return;

  const items = (r.action_items || []).slice(0, 4).map(i =>
    `<div class="mm-action-item"><span class="mm-action-owner">${i.owner || '?'}</span>${i.description || ''}</div>`
  ).join('');

  const html = `
    <div class="mm-briefing-card" id="mm-current-card">
      <div class="mm-card-stripe mm-stripe-green"></div>
      <div class="mm-card-label" style="color:#4ade80">Meeting Complete ✓</div>
      <div class="mm-card-spoken">${r.summary || 'Summary saved to Cloud Storage.'}</div>
      ${items ? `<div class="mm-section-head">Action Items</div>${items}` : ''}
      <div style="font-size:10px;color:rgba(226,245,232,0.3);margin-top:8px;font-family:monospace">
        ✓ Saved to GCS · ${r.action_items?.length || 0} tasks · ${Object.keys(r.follow_up_emails || {}).length} emails drafted
      </div>
    </div>
  `;

  setCardSlot(html);
}

// ─── CARD HELPERS ──────────────────────────────────────────────────────────

function setCardSlot(html) {
  const slot = document.getElementById('mm-card-slot');
  if (!slot) return;
  slot.innerHTML = html;
  // Animate in
  const card = slot.firstElementChild;
  if (card) {
    card.style.opacity = '0';
    card.style.transform = 'translateY(-8px)';
    requestAnimationFrame(() => {
      card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    });
  }
}

function setStandby(text) {
  const slot = document.getElementById('mm-card-slot');
  if (!slot) return;
  slot.innerHTML = `<div id="mm-standby">${text}</div>`;
}

function flashStandby(text, color) {
  const standby = document.getElementById('mm-standby');
  if (standby) {
    standby.textContent = text;
    standby.style.color = color || 'rgba(226,245,232,0.4)';
    setTimeout(() => {
      if (standby) standby.style.color = '';
    }, 3000);
  }
}

function dismissCurrentCard() {
  const card = document.getElementById('mm-current-card');
  if (!card) return;
  card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
  card.style.opacity = '0';
  card.style.transform = 'translateY(-6px)';
  setTimeout(() => {
    setStandby('◈ watching silently...');
  }, 200);
}

function confirmTask(task) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'task_confirmed', task }));
  }
  dismissCurrentCard();
  flashStandby(`✓ Task logged: ${task.description || ''}`, '#4ade80');
}

// ─── AUDIO CAPTURE (mic + tab) ────────────────────────────────────────────

async function startAudioCapture() {
  try {
    // Step 1: Get mic stream
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    // Step 2: Request tab audio via background.js
    chrome.runtime.sendMessage({ type: 'START_TAB_CAPTURE' }, async (response) => {
      if (response?.ok && response.streamId) {
        try {
          tabStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: response.streamId
              }
            },
            video: false
          });
          startMergedRecording(micStream, tabStream);
        } catch (tabErr) {
          // Tab capture failed (e.g. on plain http) — fall back to mic only
          console.warn('Tab capture unavailable, mic only:', tabErr);
          startMergedRecording(micStream, null);
        }
      } else {
        // No tab capture — mic only
        startMergedRecording(micStream, null);
      }
    });

  } catch (e) {
    console.error('Mic access denied:', e);
    setStandby('Mic access denied. Enable in Chrome settings.');
  }
}

function startMergedRecording(mic, tab) {
  audioContext = new AudioContext({ sampleRate: 16000 });

  const dest = audioContext.createMediaStreamDestination();

  // Mic input
  const micSource = audioContext.createMediaStreamSource(mic);
  micSource.connect(dest);

  // Tab input (other speakers)
  if (tab) {
    const tabSource = audioContext.createMediaStreamSource(tab);
    tabSource.connect(dest);
  }

  mergedStream = dest.stream;

  // Record 4-second chunks and send as webm
  const chunks = [];
  mediaRecorder = new MediaRecorder(mergedStream, { mimeType: 'audio/webm;codecs=opus' });

  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    if (chunks.length === 0) return;
    const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
    chunks.length = 0;

    const arrayBuffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Skip tiny chunks (silence)
    if (uint8.length < 500) {
      scheduleNextChunk();
      return;
    }

    let binary = '';
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    const b64 = btoa(binary);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'audio_chunk', audio: b64 }));
    }

    scheduleNextChunk();
  };

  function scheduleNextChunk() {
    if (micStream?.active || tabStream?.active) {
      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') mediaRecorder.stop();
      }, 4000);
    }
  }

  mediaRecorder.start();
  setTimeout(() => {
    if (mediaRecorder.state === 'recording') mediaRecorder.stop();
  }, 4000);

  setStandby('◈ watching silently...');
}

// ─── END MEETING ───────────────────────────────────────────────────────────

function mmEndMeeting() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'meeting_end' }));
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (tabStream) { tabStream.getTracks().forEach(t => t.stop()); tabStream = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }

  document.getElementById('mm-end-btn').style.display = 'none';
  setStandby('Ending meeting...');
}

// ─── BOOT ─────────────────────────────────────────────────────────────────

createOverlay();
connectWS();