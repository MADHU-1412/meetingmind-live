const BACKEND = 'wss://meetingmind-live-743060312558.us-central1.run.app/ws/';
let ws = null;
let sessionId = 'meet_' + Date.now().toString(36);
let isConnected = false;
let mediaRecorder = null;
let audioStream = null;

function createOverlay() {
  if (document.getElementById('mm-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'mm-overlay';
  overlay.innerHTML = `
    <div id="mm-header">
      <div id="mm-pulse"></div>
      <span id="mm-title">MeetingMind</span>
      <span id="mm-status">connecting...</span>
      <button id="mm-toggle">−</button>
    </div>
    <div id="mm-body">
      <div id="mm-alerts"></div>
      <div id="mm-footer">
        <button id="mm-start-btn" onclick="window.mmStart()">▶ Start Session</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('mm-toggle').onclick = () => {
    const body = document.getElementById('mm-body');
    const btn = document.getElementById('mm-toggle');
    if (body.style.display === 'none') { body.style.display = 'block'; btn.textContent = '−'; }
    else { body.style.display = 'none'; btn.textContent = '+'; }
  };

  makeDraggable(overlay);
}

function makeDraggable(el) {
  let x = 0, y = 0, mx = 0, my = 0;
  const header = document.getElementById('mm-header');
  header.onmousedown = e => {
    e.preventDefault();
    mx = e.clientX; my = e.clientY;
    document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
    document.onmousemove = e => {
      x = mx - e.clientX; y = my - e.clientY;
      mx = e.clientX; my = e.clientY;
      el.style.top = (el.offsetTop - y) + 'px';
      el.style.left = (el.offsetLeft - x) + 'px';
    };
  };
}

function connectWS() {
  try {
    ws = new WebSocket(BACKEND + sessionId);
    ws.onopen = () => {
      isConnected = true;
      document.getElementById('mm-status').textContent = 'live';
      document.getElementById('mm-status').style.color = '#4ade80';
      document.getElementById('mm-pulse').style.background = '#4ade80';
    };
    ws.onmessage = e => {
      try { handleMessage(JSON.parse(e.data)); } catch(err) {}
    };
    ws.onclose = () => {
      isConnected = false;
      document.getElementById('mm-status').textContent = 'reconnecting...';
      setTimeout(connectWS, 3000);
    };
  } catch(e) { setTimeout(connectWS, 3000); }
}

function handleMessage(msg) {
  if (msg.type === 'phase1_complete') showBriefing(msg.briefing);
  else if (msg.type === 'overlay_alert') showAlert(msg.alert);
  else if (msg.type === 'task_logged') showTaskAlert(msg.task);
  else if (msg.type === 'phase3_complete') showSummary(msg.result);
}

function showBriefing(b) {
  if (!b) return;
  addAlert({
    type: 'briefing',
    title: 'Pre-Meeting Briefing',
    message: b.spoken_brief || 'Meeting starting.',
    color: '#4ade80',
    autoDismiss: 12000
  });
}

function showAlert(a) {
  if (!a?.show_overlay) return;
  const colors = { fact_shield: '#f87171', question_anticipator: '#60a5fa', negotiation: '#fbbf24', task_logger: '#4ade80' };
  const icons = { fact_shield: '⚠', question_anticipator: '◎', negotiation: '⊕', task_logger: '✦' };
  addAlert({
    type: a.layer,
    title: a.title || 'Alert',
    message: a.message || '',
    source: a.source,
    color: colors[a.layer] || '#4ade80',
    urgency: a.urgency,
    task: a.task,
    autoDismiss: a.urgency === 'high' ? 0 : 12000
  });
}

function showTaskAlert(task) {
  addAlert({ type: 'task_logger', title: 'Task Logged', message: task.description || '', color: '#4ade80', autoDismiss: 8000 });
}

function showSummary(r) {
  if (!r) return;
  addAlert({ type: 'summary', title: 'Meeting Complete', message: r.summary || 'Summary ready.', color: '#4ade80', autoDismiss: 0 });
}

function addAlert({ type, title, message, source, color, urgency, task, autoDismiss }) {
  const container = document.getElementById('mm-alerts');
  const el = document.createElement('div');
  el.className = 'mm-alert';
  el.style.borderLeftColor = color;
  el.innerHTML = `
    <div class="mm-alert-title" style="color:${color}">${title}${urgency === 'high' ? ' <span class="mm-urgent">urgent</span>' : ''}</div>
    <div class="mm-alert-msg">${message}</div>
    ${source ? `<div class="mm-alert-source">📎 ${source}</div>` : ''}
    ${task ? `<button class="mm-confirm-btn" onclick="window.mmConfirmTask(${JSON.stringify(task).replace(/"/g, '&quot;')}, this)">✓ Confirm Task</button>` : ''}
    <button class="mm-dismiss" onclick="this.parentNode.remove()">×</button>
  `;
  container.insertBefore(el, container.firstChild);
  if (autoDismiss > 0) setTimeout(() => { if (el.parentNode) el.remove(); }, autoDismiss);
  while (container.children.length > 4) container.removeChild(container.lastChild);
}

window.mmStart = async function() {
  const title = prompt('Meeting title:', document.title.replace(' - Google Meet', '') || 'Google Meet');
  const attendees = prompt('Attendees (comma separated):', '') || '';
  const agenda = prompt('Agenda (optional):', '') || '';

  if (!title) return;

  document.getElementById('mm-start-btn').textContent = '⏳ Starting...';
  document.getElementById('mm-start-btn').disabled = true;

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'meeting_start',
      meeting_info: {
        title,
        agenda,
        attendees: attendees.split(',').map(s => s.trim()).filter(Boolean)
      }
    }));
  }

  await startAudioCapture();
  document.getElementById('mm-start-btn').textContent = '🔴 Live';
};

async function startAudioCapture() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
    mediaRecorder.ondataavailable = async e => {
      if (e.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
        const buffer = await e.data.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        ws.send(JSON.stringify({ type: 'audio_chunk', audio: b64 }));
      }
    };
    mediaRecorder.start(2000);
    addAlert({ type: 'system', title: 'Microphone Active', message: 'MeetingMind is now listening to the meeting.', color: '#4ade80', autoDismiss: 4000 });
  } catch(e) {
    addAlert({ type: 'error', title: 'Mic Error', message: 'Could not access microphone. Please allow mic access.', color: '#f87171', autoDismiss: 0 });
  }
}

window.mmConfirmTask = function(task, btn) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'task_confirmed', task }));
  }
  btn.textContent = '✓ Confirmed';
  btn.disabled = true;
  btn.style.background = 'rgba(74,222,128,0.3)';
};

window.mmEndMeeting = function() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'meeting_end' }));
    addAlert({ type: 'system', title: 'Processing...', message: 'Generating summary and action items...', color: '#fbbf24', autoDismiss: 0 });
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  if (audioStream) audioStream.getTracks().forEach(t => t.stop());
};

createOverlay();
connectWS();
