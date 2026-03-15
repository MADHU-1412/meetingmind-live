cat > backend/services/audio.py << 'EOF'
import asyncio, struct
from google import genai
from google.genai import types
from .secrets import GEMINI_API_KEY

client = genai.Client(api_key=GEMINI_API_KEY)

AUDIO_CONFIG = types.LiveConnectConfig(
    response_modalities=["TEXT"],
    system_instruction=types.Content(parts=[types.Part(text='You are MeetingMind. Listen to meeting conversations. Respond ONLY in JSON: {"speaker":"Speaker A","text":"what they said","alert_type":"question|wrong_fact|task_assigned|decision|none","alert_message":"what to show host","confidence":0.9}')]),
)

async def process_audio_stream(audio_chunk: bytes, session_id: str) -> dict:
    try:
        async with client.aio.live.connect(model="gemini-2.0-flash-live-001", config=AUDIO_CONFIG) as session:
            await session.send(input=types.LiveClientRealtimeInput(media_chunks=[types.Blob(data=audio_chunk, mime_type="audio/pcm")]))
            async for response in session.receive():
                if response.text:
                    import json
                    try:
                        return json.loads(response.text)
                    except:
                        return {"speaker": "Unknown", "text": response.text, "alert_type": "none", "alert_message": "", "confidence": 0.0}
    except Exception as e:
        return {"speaker": "Unknown", "text": "", "alert_type": "error", "alert_message": str(e), "confidence": 0.0}

def detect_silence(audio_chunk: bytes, threshold: float = 0.02) -> bool:
    if len(audio_chunk) < 2:
        return True
    samples = struct.unpack(f"{len(audio_chunk)//2}h", audio_chunk)
    rms = (sum(s*s for s in samples) / len(samples)) ** 0.5
    return (rms / 32768.0) < threshold
EOF