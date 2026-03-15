const BACKEND = 'wss://meetingmind-live-743060312558.us-central1.run.app/ws/';
let ws = null;
let sessionId = 'meet_' + Date.now().toString(36);
let audioStream = null;
let audioCtx = null;
let processor = null;

function createOverlay() {
  if (document.getElementById('mm-overlay')) return;
  
  const overlay = document.createElement('div');
  overlay.id = 'mm-overlay';
  
  const header = document.createElement('div');
  header.id = 'mm-header';
  
  const pulse = document.createElement('div');
  pulse.id = 'mm-pulse';
  
  const title = document.createElement('span');
  title.id = 'mm-title';
  title.textContent = 'MeetingMind';
  
  const status = document.createElement('span');
  status.id = 'mm-status';
  status.textContent = 'connecting...';
  
  const toggle = document.createElement('button');
  toggle.id = 'mm-toggle';
  toggle.textContent = '−';
  toggle.addEventListener('click', () => {
    const body = document.getElementById('mm-body');
    if (body.style.display === 'none') { body.style.display = 'block'; toggle.textContent = '−'; }
    else { body.style.display = 'none'; toggle.textContent = '+'; }
  });
  
  header.appendChild(pulse);
  header.appendChild(title);
  header.appendChild(status);
  header.appendChild(toggle);
  
  const body = document.createElement('div');
  body.id = 'mm-body';
  
  const form = document.createElement('div');
  form.id = 'mm-form';
  
  const titleInput = document.createElement('input');
  titleInput.id = 'mm-input-title';
  titleInput.type = 'text';
  titleInput.placeholder = 'Meeting title...';
  titleInput.className = 'mm-input';
  
  const attendeesInput = document.createElement('input');
  attendeesInput.id = 'mm-input-attendees';
  attendeesInput.type = 'text';
  attendeesInput.placeholder = 'Attendees (Alice, Bob...)';
  attendeesInput.className = 'mm-input';
  
  const agendaInput = document.createElement('input');
  agendaInput.id = 'mm-input-agenda';
  agendaInput.type = 'text';
  agendaInput.placeholder = 'Agenda (optional)';
  agendaInput.className = 'mm-input';
  
  const startBtn = document.createElement('button');
  startBtn.id = 'mm-start-btn';
  startBtn.textContent = '▶ Start Session';
  startBtn.addEventListener('click', mmStart);
  
  form.appendChild(titleInput);
  form.appendChild(attendeesInput);
  form.appendChild(agendaInput);
  form.appendChild(startBtn);
  
  const alerts = document.createElement('div');
  alerts.id = 'mm-alerts';
  
  const footer = document.createElement('div');
  footer.id = 'mm-footer';
  
  const endBtn = document.createElement('button');
  endBtn.id = 'mm-end-btn';
  endBtn.textContent = '■ End Meeting';
  endBtn.style.display = 'none';
  endBtn.addEventListener('click', mmEndMeeting);
  
  footer.appendChild(endBtn);
  
  body.appendChild(form);
  body.appendChild(alerts);
  body.appendChild(footer);
  
  overlay.appendChild(header);
  overlay.appendChild(body);
  document.body.appendChild(overlay);
  
  makeDraggable(overlay, header);
}

function makeDraggable(el, handle) {
  let x=0, y=0, mx=0, my=0;
  handle.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    mx=e.clientX; my=e.clientY;
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('mousemove', doDrag);
  });
  function doDrag(e) {
    x=mx-e.clientX; y=my-e.clientY;
    mx=e.clientX; my=e.clientY;
    el.style.top=(el.offsetTop-y)+'px';
    el.style.right='auto';
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
      const status = document.getElementById('mm-status');
      const pulse = document.getElementById('mm-pulse');
      if (status) { status.textContent = 'live'; status.style.color = '#4ade80'; }
      if (pulse) pulse.style.background = '#4ade80';
    };
    ws.onmessage = e => { try { handleMessage(JSON.parse(e.data)); } catch(err) {} };
    ws.onclose = () => {
      const status = document.getElementById('mm-status');
      if (status) { status.textContent = 'reconnecting...'; status.style.color = ''; }
      setTimeout(connectWS, 3000);
    };
  } catch(e) { setTimeout(connectWS, 3000); }
}

function handleMessage(msg) {
  if (msg.type === 'phase1_starting') {
    addAlert('Preparing Briefing', 'Reading your meeting documents from Cloud Storage...', '#4ade80', 5000);
  } else if (msg.type === 'phase1_complete') {
    showBriefing(msg.briefing);
  } else if (msg.type === 'overlay_alert') {
    showAlert(msg.alert);
  } else if (msg.type === 'task_logged') {
    addAlert('Task Logged', msg.task?.description||'', '#4ade80', 8000);
  } else if (msg.type === 'phase3_starting') {
    addAlert('Generating Summary', 'Processing transcript and creating action items...', '#fbbf24', 0);
  } else if (msg.type === 'phase3_complete') {
    showSummary(msg.result);
  } else if (msg.type === 'error') {
    addAlert('Error', msg.message||'Something went wrong', '#f87171', 8000);
  }
}

function showBriefing(b) {
  if (!b) return;
  addAlert('Pre-Meeting Briefing', b.spoken_brief||'Meeting starting.', '#4ade80', 15000);
  (b.watch_out_for||[]).forEach(w => addAlert('Watch Out', w, '#fbbf24', 10000));
  (b.key_context||[]).slice(0,2).forEach(c => addAlert('Context', c, '#60a5fa', 10000));
}

function showAlert(a) {
  if (!a?.show_overlay) return;
  const colors = {
    fact_shield: '#f87171',
    question_anticipator: '#60a5fa',
    negotiation: '#fbbf24',
    task_logger: '#4ade80'
  };
  const color = colors[a.layer] || '#4ade80';
  const el = addAlert(a.title||'Alert', a.message||'', color, a.urgency==='high' ? 0 : 13000);
  
  if (a.layer === 'task_logger' && a.task) {
    const btn = document.createElement('button');
    btn.className = 'mm-confirm-btn';
    btn.textContent = '✓ Confirm Task';
    btn.addEventListener('click', () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type:'task_confirmed', task:a.task}));
      }
      btn.textContent = '✓ Confirmed';
      btn.disabled = true;
    });
    el.appendChild(btn);
  }
}

function showSummary(r) {
  if (!r) return;
  addAlert('Meeting Complete ✓', r.summary||'Summary ready.', '#4ade80', 0);
  (r.action_items||[]).slice(0,3).forEach(item => {
    addAlert(item.owner||'Action Item', item.description||'', '#fbbf24', 0);
  });
}

function addAlert(title, message, color, autoDismiss) {
  const container = document.getElementById('mm-alerts');
  if (!container) return;
  
  const el = document.createElement('div');
  el.className = 'mm-alert';
  el.style.borderLeftColor = color;
  
  const titleEl = document.createElement('div');
  titleEl.className = 'mm-alert-title';
  titleEl.style.color = color;
  titleEl.textContent = title;
  
  const msgEl = document.createElement('div');
  msgEl.className = 'mm-alert-msg';
  msgEl.textContent = message;
  
  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'mm-dismiss';
  dismissBtn.textContent = '×';
  dismissBtn.addEventListener('click', () => el.remove());
  
  el.appendChild(titleEl);
  el.appendChild(msgEl);
  el.appendChild(dismissBtn);
  
  container.insertBefore(el, container.firstChild);
  if (autoDismiss > 0) setTimeout(() => { if (el.parentNode) el.remove(); }, autoDismiss);
  while (container.children.length > 5) container.removeChild(container.lastChild);
  return el;
}

async function mmStart() {
  const titleVal = document.getElementById('mm-input-title').value.trim() || document.title.replace(' - Google Meet','') || 'Google Meet';
  const attendeesVal = document.getElementById('mm-input-attendees').value.trim();
  const agendaVal = document.getElementById('mm-input-agenda').value.trim();
  
  const btn = document.getElementById('mm-start-btn');
  btn.textContent = '⏳ Starting...';
  btn.disabled = true;
  
  document.getElementById('mm-form').style.display = 'none';
  document.getElementById('mm-end-btn').style.display = 'block';
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'meeting_start',
      meeting_info: {
        title: titleVal,
        agenda: agendaVal,
        attendees: attendeesVal.split(',').map(s=>s.trim()).filter(Boolean)
      }
    }));
  }
  
  await startAudioCapture();
}

async function startAudioCapture() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(audioStream);
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
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
    addAlert('Microphone Active', 'MeetingMind is now listening to the meeting.', '#4ade80', 4000);
  } catch(e) {
    addAlert('Mic Error', 'Allow microphone access and try again.', '#f87171', 0);
    document.getElementById('mm-form').style.display = 'block';
    document.getElementById('mm-end-btn').style.display = 'none';
    const btn = document.getElementById('mm-start-btn');
    btn.textContent = '▶ Start Session';
    btn.disabled = false;
  }
}

function mmEndMeeting() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'meeting_end' }));
  }
  if (processor) { processor.disconnect(); processor = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); audioStream = null; }
  document.getElementById('mm-form').style.display = 'block';
  document.getElementById('mm-end-btn').style.display = 'none';
  const btn = document.getElementById('mm-start-btn');
  btn.textContent = '▶ Start Session';
  btn.disabled = false;
}

createOverlay();
connectWS();
