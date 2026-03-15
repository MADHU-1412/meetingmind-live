import json
import base64
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.agents.orchestrator import MeetingOrchestrator
from backend.services.audio import process_audio_stream, detect_silence
from backend.services.vision import analyze_screen

app = FastAPI(title="MeetingMind Live")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

active_sessions: dict = {}

@app.get("/")
async def root():
    return {"status": "MeetingMind Live is running"}

@app.get("/health")
async def health():
    return {"status": "healthy", "sessions": len(active_sessions)}

@app.get("/ui")
async def ui():
    return FileResponse("frontend/index.html")

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    orchestrator = MeetingOrchestrator(session_id, websocket)
    active_sessions[session_id] = orchestrator
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")
            if msg_type == "meeting_start":
                await orchestrator.start_session(message.get("meeting_info", {}))
            elif msg_type == "screen_update":
                screenshot_b64 = message.get("screenshot")
                if screenshot_b64:
                    context = await analyze_screen(screenshot_b64)
                    await orchestrator.update_screen(context)
                    await websocket.send_text(json.dumps({"type": "screen_analyzed", "context": context}))
            elif msg_type == "audio_chunk":
                audio_b64 = message.get("audio")
                if audio_b64:
                    audio_bytes = base64.b64decode(audio_b64)
                    if not detect_silence(audio_bytes):
                        result = await process_audio_stream(audio_bytes, session_id)
                        await orchestrator.process_audio_result(result)
            elif msg_type == "task_confirmed":
                await orchestrator.log_task(message.get("task", {}))
            elif msg_type == "meeting_end":
                await orchestrator.end_meeting()
    except WebSocketDisconnect:
        active_sessions.pop(session_id, None)
    except Exception as e:
        await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
    finally:
        active_sessions.pop(session_id, None)
