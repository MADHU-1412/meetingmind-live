const BACKEND = 'wss://meetingmind-live-743060312558.us-central1.run.app/ws/';
let ws = null;
let sessionId = 'meet_' + Date.now().toString(36);
let audioStream = null;
let mediaRecorder = null;
let recording = false;

function createOverlay() {
  if (document.getElementById('mm-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'mm-overlay';
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
  const toggle = document.createElement('button');
  toggle.id = 'mm-toggle';
  toggle.textContent = '−';
  toggle.addEventListener('click', () => {
    const body = document.getElementById('mm-body');
    if (body.style.display === 'none') { body.style.display = 'block'; toggle.textContent = '−'; }
    else { body.style.display = 'none'; toggle.textContent = '+'; }
  });
  header.appendChild(pulse);
  header.appendChild(titleEl);
  header.appendChild(status);
  header.appendChild(toggle);
  const body = document.createElement('div');
  body.id = 'mm-body';
  const form = document.createElement('div');
  form.id = 'mm-form';
  const t = document.createElement('input');
  t.id = 'mm-input-title'; t.type = 'text';
  t.placeholder = 'Meeting title...'; t.className = 'mm-input';
  const a = document.createElement('input');
  a.id = 'mm-input-attendees'; a.type = 'text';
  a.placeholder = 'Attendees (Alice, Bob...)'; a.className = 'mm-input';
  const ag = document.createElement('input');
  ag.id = 'mm-input-agenda'; ag.type = 'text';
  ag.placeholder = 'Agenda (optional)'; ag.className = 'mm-input';
  const startBtn = document.createElement('button');
  startBtn.id = 'mm-start-btn';
  startBtn.textContent = '▶ Start Session';
  startBtn.addEventListener('click', mmStart);
  form.appendChild(t); form.appendChild(a); form.appendChild(ag); form.appendChild(startBtn);
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
  let x=0,y=0,mx=0,my=0;
  handle.addEventListener('mousedown', e => {
    if (e.target.tagName==='BUTTON') return;
    e.preventDefault(); mx=e.clientX; my=e.clientY;
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('mousemove', doDrag);
  });
  function doDrag(e) { x=mx-e.clientX; y=my-e.clientY; mx=e.clientX; my=e.clientY; el.style.top=(el.offsetTop-y)+'px'; el.style.right='auto'; el.style.left=(el.offsetLeft-x)+'px'; }
  function stopDrag() { document.removeEventListener('mouseup',stopDrag); document.removeEventListener('mousemove',doDrag); }
}

function connectWS() {
  try {
    ws = new WebSocket(BACKEND + sessionId);
    ws.onopen = () => {
      const s=document.getElementById('mm-status'),p=document.getElementById('mm-pulse');
      if(s){s.textContent='live';s.style.color='#4ade80';}
      if(p) p.style.background='#4ade80';
    };
    ws.onmessage = e => { try { handleMessage(JSON.parse(e.data)); } catch(err){} };
    ws.onclose = () => {
      const s=document.getElementById('mm-status');
      if(s){s.textContent='reconnecting...';s.style.color='';}
      setTimeout(connectWS, 3000);
    };
    ws.onerror = () => {
      setTimeout(connectWS, 3000);
    };
  } catch(e) { setTimeout(connectWS, 3000); }
}

function handleMessage(msg) {
  if (msg.type==='phase1_starting') addAlert('Preparing Briefing...','Reading your documents','#4ade80',5000);
  else if (msg.type==='phase1_complete') showBriefing(msg.briefing);
  else if (msg.type==='overlay_alert') showAlert(msg.alert);
  else if (msg.type==='task_logged') addAlert('Task Logged',msg.task?.description||'','#4ade80',8000);
  else if (msg.type==='phase3_starting') addAlert('Generating Summary...','Processing transcript','#fbbf24',0);
  else if (msg.type==='phase3_complete') showSummary(msg.result);
  else if (msg.type==='error') addAlert('Error',msg.message||'','#f87171',8000);
}

function showBriefing(b) {
  if (!b) return;
  addAlert('Pre-Meeting Briefing', b.spoken_brief||'Meeting starting.', '#4ade80', 20000);
  (b.watch_out_for||[]).forEach(w => addAlert('Watch Out', w, '#fbbf24', 15000));
  (b.key_context||[]).slice(0,2).forEach(c => addAlert('Context', c, '#60a5fa', 15000));
}

function showAlert(a) {
  if (!a?.show_overlay) return;
  const colors = {fact_shield:'#f87171',question_anticipator:'#60a5fa',negotiation:'#fbbf24',task_logger:'#4ade80'};
  const el = addAlert(a.title||'Alert', a.message||'', colors[a.layer]||'#4ade80', a.urgency==='high'?0:13000);
  if (a.layer==='task_logger' && a.task && el) {
    const btn = document.createElement('button');
    btn.className = 'mm-confirm-btn';
    btn.textContent = '✓ Confirm Task';
    btn.addEventListener('click', () => {
      if (ws&&ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'task_confirmed',task:a.task}));
      btn.textContent='✓ Confirmed'; btn.disabled=true;
    });
    el.appendChild(btn);
  }
}

function showSummary(r) {
  if (!r) return;
  addAlert('Meeting Complete ✓', r.summary||'Summary ready.', '#4ade80', 0);
  (r.action_items||[]).slice(0,3).forEach(i => addAlert(i.owner||'Action', i.description||'', '#fbbf24', 0));
}

function addAlert(title, message, color, autoDismiss) {
  const container = document.getElementById('mm-alerts');
  if (!container) return null;
  const el = document.createElement('div');
  el.className = 'mm-alert';
  el.style.borderLeftColor = color;
  const t = document.createElement('div');
  t.className = 'mm-alert-title'; t.style.color = color; t.textContent = title;
  const m = document.createElement('div');
  m.className = 'mm-alert-msg'; m.textContent = message;
  const x = document.createElement('button');
  x.className = 'mm-dismiss'; x.textContent = '×';
  x.addEventListener('click', () => el.remove());
  el.appendChild(t); el.appendChild(m); el.appendChild(x);
  container.insertBefore(el, container.firstChild);
  if (autoDismiss > 0) setTimeout(() => { if (el.parentNode) el.remove(); }, autoDismiss);
  while (container.children.length > 5) container.removeChild(container.lastChild);
  return el;
}

async function mmStart() {
  const titleVal = document.getElementById('mm-input-title').value.trim() || 'Google Meet';
  const attendeesVal = document.getElementById('mm-input-attendees').value.trim();
  const agendaVal = document.getElementById('mm-input-agenda').value.trim();
  const btn = document.getElementById('mm-start-btn');
  btn.textContent = '⏳ Starting...';
  btn.disabled = true;

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

  document.getElementById('mm-form').style.display = 'none';
  document.getElementById('mm-end-btn').style.display = 'block';

  await startAudioCapture();
}

async function startAudioCapture() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({audio:true, video:false});

    // Use MediaRecorder instead of ScriptProcessor - more reliable
    mediaRecorder = new MediaRecorder(audioStream, {mimeType: 'audio/webm;codecs=opus'});
    
    mediaRecorder.ondataavailable = async (e) => {
      if (e.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const b64 = reader.result.split(',')[1];
          ws.send(JSON.stringify({type: 'audio_chunk', audio: b64}));
        };
        reader.readAsDataURL(e.data);
      }
    };

    mediaRecorder.start(3000); // Send chunk every 3 seconds
    recording = true;
    addAlert('Microphone Active', 'MeetingMind is now listening to the meeting.', '#4ade80', 4000);
  } catch(e) {
    addAlert('Mic Error', 'Allow microphone access and try again. Error: ' + e.message, '#f87171', 0);
    document.getElementById('mm-form').style.display = 'block';
    document.getElementById('mm-end-btn').style.display = 'none';
    const btn = document.getElementById('mm-start-btn');
    btn.textContent = '▶ Start Session'; btn.disabled = false;
  }
}

function mmEndMeeting() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'meeting_end'}));
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  if (audioStream) { audioStream.getTracks().forEach(t=>t.stop()); audioStream=null; }
  recording = false;
  document.getElementById('mm-form').style.display = 'block';
  document.getElementById('mm-end-btn').style.display = 'none';
  const btn = document.getElementById('mm-start-btn');
  btn.textContent = '▶ Start Session'; btn.disabled = false;
}

createOverlay();
connectWS();
