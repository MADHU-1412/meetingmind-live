import struct
import json
from google import genai
from google.genai import types
from .secrets import GEMINI_API_KEY

client = genai.Client(api_key=GEMINI_API_KEY)

# System prompt that reliably produces the JSON schema we need
SYSTEM_PROMPT = """You are MeetingMind, a real-time meeting assistant. 
Transcribe the audio and analyze it. 
Respond ONLY with valid JSON — no markdown, no explanation, just JSON:
{
  "speaker": "Speaker A",
  "text": "exact transcription of what was said",
  "alert_type": "none",
  "alert_message": "",
  "confidence": 0.9
}

alert_type must be exactly one of:
- "none"          — normal speech, no action needed
- "wrong_fact"    — a verifiable number or fact that seems incorrect
- "question"      — someone is asking a question the host needs to answer
- "task_assigned" — a task or action item is being assigned to someone
- "decision"      — a negotiation, price, or decision point is being discussed

Only use non-"none" types when clearly warranted. When in doubt, use "none"."""

AUDIO_CONFIG = types.LiveConnectConfig(
    response_modalities=["TEXT"],
    system_instruction=types.Content(parts=[types.Part(text=SYSTEM_PROMPT)]),
)

async def process_audio_stream(audio_chunk: bytes, session_id: str) -> dict:
    """
    Process an audio chunk through Gemini Live.
    Accepts either raw PCM (16kHz 16-bit mono) or webm/opus bytes.
    Returns a structured transcript entry.
    """
    fallback = {
        "speaker": "Unknown",
        "text": "",
        "alert_type": "none",
        "alert_message": "",
        "confidence": 0.0
    }

    if not audio_chunk or len(audio_chunk) < 100:
        return fallback

    # Detect format: webm starts with 0x1a 0x45 0xdf 0xa3
    is_webm = audio_chunk[:4] == b'\x1a\x45\xdf\xa3'
    mime_type = "audio/webm;codecs=opus" if is_webm else "audio/pcm;rate=16000"

    try:
        async with client.aio.live.connect(
            model="gemini-2.0-flash-live-001",
            config=AUDIO_CONFIG
        ) as session:
            await session.send(
                input=types.LiveClientRealtimeInput(
                    media_chunks=[types.Blob(data=audio_chunk, mime_type=mime_type)]
                )
            )

            full_text = ""
            async for response in session.receive():
                if response.text:
                    full_text += response.text

            if not full_text.strip():
                return fallback

            # Strip markdown fences if Gemini adds them despite instructions
            text = full_text.strip()
            if "```" in text:
                parts = text.split("```")
                for part in parts:
                    part = part.strip()
                    if part.startswith("json"):
                        part = part[4:].strip()
                    if part.startswith("{"):
                        text = part
                        break

            # Find the JSON object
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                text = text[start:end]

            result = json.loads(text)

            # Ensure all required fields are present
            return {
                "speaker": result.get("speaker", "Unknown"),
                "text": result.get("text", ""),
                "alert_type": result.get("alert_type", "none"),
                "alert_message": result.get("alert_message", ""),
                "confidence": float(result.get("confidence", 0.8))
            }

    except json.JSONDecodeError as e:
        print(f"Audio JSON parse error: {e} | raw: {full_text[:200]}")
        return fallback
    except Exception as e:
        print(f"Audio processing error: {e}")
        return {**fallback, "alert_type": "error", "alert_message": str(e)}


def detect_silence(audio_chunk: bytes, threshold: float = 0.02) -> bool:
    """
    Returns True if the audio chunk is silent (below threshold RMS).
    Handles both PCM and non-PCM gracefully.
    """
    if len(audio_chunk) < 2:
        return True

    # Can only measure PCM silence accurately; skip for webm
    is_webm = audio_chunk[:4] == b'\x1a\x45\xdf\xa3'
    if is_webm:
        return len(audio_chunk) < 500  # Very small webm chunk = likely silence

    try:
        n_samples = len(audio_chunk) // 2
        if n_samples == 0:
            return True
        samples = struct.unpack(f"{n_samples}h", audio_chunk[:n_samples * 2])
        rms = (sum(s * s for s in samples) / len(samples)) ** 0.5
        return (rms / 32768.0) < threshold
    except Exception:
        return False