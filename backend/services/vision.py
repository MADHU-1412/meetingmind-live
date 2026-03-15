cat > backend/services/vision.py << 'EOF'
import base64, json
from google import genai
from google.genai import types
from .secrets import GEMINI_API_KEY

client = genai.Client(api_key=GEMINI_API_KEY)

async def analyze_screen(screenshot_base64: str) -> dict:
    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash-001",
            contents=[
                types.Part(inline_data=types.Blob(mime_type="image/jpeg", data=base64.b64decode(screenshot_base64))),
                types.Part(text='Analyze this meeting screen. Respond in JSON: {"documents_visible":[],"key_facts":[{"fact":"","value":"","source":""}],"people_mentioned":[],"summary":""}')
            ]
        )
        text = response.text.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"): text = text[4:]
        return json.loads(text)
    except Exception as e:
        return {"documents_visible": [], "key_facts": [], "people_mentioned": [], "summary": "unavailable"}
EOF