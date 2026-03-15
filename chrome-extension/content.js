const BACKEND = 'wss://meetingmind-live-743060312558.us-central1.run.app/ws/';
let ws = null;
let sessionId = 'meet_' + Date.now().toString(36);
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
        <button id="mm-start-btn">▶ Start Session</button>
        <button id="mm-end-btn">■ End</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('mm-toggle').addEventListener('click', () => {
    const body = document.getElementById('mm-body');
    const btn = document.getElementById('mm-toggle');
    if (body.style.display === 'none') { body.style.display = 'block'; btn.textContent = '−'; }
    else { body.style.display = 'none'; btn.textContent = '+'; }
  });

  document.getElementById('mm-start-btn').addEventListener('click', mmStart);
  document.getElementById('mm-end-btn').addEventListener('click', mmEndMeeting);

  makeDraggable(overlay);
}

function makeDraggable(el) {
  let x=0, y=0, mx=0, my=0;
  const header = document.getElementById('mm-header');
  header.addEventListener('mousedown', e => {
    e.preventDefault();
    mx=e.clientX; my=e.clientY;
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('mousemove', doDrag);
  });
  function doDrag(e) {
    x=mx-e.clientX; y=my-e.clientY;
    mx=e.clientX; my=e.clientY;
    el.style.top=(el.offsetTop-y)+'px';
    el.style.left=(el.offsetLeft-x)+'px';
  }
  function stopDrag() {
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('mousemove', doDrag);
  }
}

function connectWS() {
  try {
    ws = new WebSocket(BACKEND + sessionId);
    ws.onopen = () => {
      document.getElementById('mm-status').textContent = 'live';
      document.getElementById('mm-status').style.color = '#4ade80';
      document.getElementById('mm-pulse').style.background = '#4ade80';
    };
    ws.onmessage = e => { try { handleMessage(JSON.parse(e.data)); } catch(err) {} };
    ws.onclose = () => {
      document.getElementById('mm-status').textContent = 'reconnecting...';
      document.getElementById('mm-status').style.color = '';
      setTimeout(connectWS, 3000);
    };
  } catch(e) { setTimeout(connectWS, 3000); }
}

function handleMessage(msg) {
  if (msg.type === 'phase1_complete') showBriefing(msg.briefing);
  else if (msg.type === 'overlay_alert') showAlert(msg.alert);
  else if (msg.type === 'task_logged') addAlert({title:'Task Logged', message: msg.task?.description||'', color:'#4ade80', autoDismiss:8000});
  else if (msg.type === 'phase3_complete') showSummary(msg.result);
  else if (msg.type === 'phase1_starting') addAlert({title:'Preparing Briefing...', message:'Reading your meeting documents', color:'#4ade80', autoDismiss:4000});
  else if (msg.type === 'phase3_starting') addAlert({title:'Generating Summary...', message:'Processing transcript and tasks', color:'#fbbf24', autoDismiss:0});
}

function showBriefing(b) {
  if (!b) return;
  addAlert({ title:'Pre-Meeting Briefing', message: b.spoken_brief||'Meeting starting.', color:'#4ade80', autoDismiss:15000 });
  (b.watch_out_for||[]).forEach(w => addAlert({ title:'Watch Out', message:w, color:'#fbbf24', autoDismiss:10000 }));
}

function showAlert(a) {
  if (!a?.show_overlay) return;
  const colors = { fact_shield:'#f87171', question_anticipator:'#60a5fa', negotiation:'#fbbf24', task_logger:'#4ade80' };
  const el = addAlert({
    title: a.title||'Alert',
    message: a.message||'',
    source: a.source,
    color: colors[a.layer]||'#4ade80',
    urgency: a.urgency,
    autoDismiss: a.urgency==='high' ? 0 : 13000
  });
  if (a.layer === 'task_logger' && a.task) {
    const btn = document.createElement('button');
    btn.className = 'mm-confirm-btn';
    btn.textContent = '✓ Confirm Task';
    btn.addEventListener('click', () => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'task_confirmed', task:a.task}));
      btn.textContent = '✓ Confirmed';
      btn.disabled = true;
    });
    el.appendChild(btn);
  }
}

function showSummary(r) {
  if (!r) return;
  addAlert({ title:'Meeting Complete ✓', message: r.summary||'Summary ready.', color:'#4ade80', autoDismiss:0 });
  (r.action_items||[]).slice(0,3).forEach(item => {
    addAlert({ title: item.owner||'Action Item', message: item.description||'', color:'#fbbf24', autoDismiss:0 });
  });
}

function addAlert({ title, message, source, color, urgency, autoDismiss }) {
  const container = document.getElementById('mm-alerts');
  const el = document.createElement('div');
  el.className = 'mm-alert';
  el.style.borderLeftColor = color;

  const titleEl = document.createElement('div');
  titleEl.className = 'mm-alert-title';
  titleEl.style.color = color;
  titleEl.textContent = title;
  if (urgency === 'high') {
    const badge = document.createElement('span');
    badge.className = 'mm-urgent';
    badge.textContent = 'urgent';
    titleEl.appendChild(badge);
  }

  const msgEl = document.createElement('div');
  msgEl.className = 'mm-alert-msg';
  msgEl.textContent = message;

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'mm-dismiss';
  dismissBtn.textContent = '×';
  dismissBtn.addEventListener('click', () => el.remove());

  el.appendChild(titleEl);
  el.appendChild(msgEl);
  if (source) {
    const srcEl = document.createElement('div');
    srcEl.className = 'mm-alert-source';
    srcEl.textContent = '📎 ' + source;
    el.appendChild(srcEl);
  }
  el.appendChild(dismissBtn);

  container.insertBefore(el, container.firstChild);
  if (autoDismiss > 0) setTimeout(() => { if (el.parentNode) el.remove(); }, autoDismiss);
  while (container.children.length > 5) container.removeChild(container.lastChild);
  return el;
}

async function mmStart() {
  const title = prompt('Meeting title:', document.title.replace(' - Google Meet','') || 'Google Meet');
  if (!title) return;
  const attendeesStr = prompt('Attendees (comma separated):', '') || '';
  const agenda = prompt('Agenda (optional):', '') || '';

  const btn = document.getElementById('mm-start-btn');
  btn.textContent = '⏳ Starting...';
  btn.disabled = true;

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'meeting_start',
      meeting_info: {
        title,
        agenda,
        attendees: attendeesStr.split(',').map(s=>s.trim()).filter(Boolean)
      }
    }));
  }

  await startAudioCapture();
  btn.textContent = '🔴 Live';
}

async function startAudioCapture() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(audioStream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    source.connect(processor);
    processor.connect(audioCtx.destination);
    processor.onaudioprocess = e => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const buffer = new ArrayBuffer(input.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(i*2, s<0 ? s*0x8000 : s*0x7FFF, true);
      }
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      ws.send(JSON.stringify({ type: 'audio_chunk', audio: b64 }));
    };
    addAlert({ title:'Microphone Active', message:'MeetingMind is now listening.', color:'#4ade80', autoDismiss:4000 });
  } catch(e) {
    addAlert({ title:'Mic Error', message:'Allow microphone access and try again.', color:'#f87171', autoDismiss:0 });
  }
}

function mmEndMeeting() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'meeting_end' }));
  if (audioStream) audioStream.getTracks().forEach(t => t.stop());
  document.getElementById('mm-start-btn').textContent = '▶ Start Session';
  document.getElementById('mm-start-btn').disabled = false;
}

createOverlay();
connectWS();
