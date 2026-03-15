import os
from dotenv import load_dotenv

load_dotenv()

def get_secret(secret_id: str) -> str:
    local_val = os.getenv(secret_id)
    if local_val:
        return local_val
    try:
        from google.cloud import secretmanager
        project_id = os.getenv("GCP_PROJECT_ID", "meetingmind-live")
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
        response = client.access_secret_version(request={"name": name})
        return response.payload.data.decode("UTF-8")
    except Exception as e:
        print(f"Secret {secret_id} not found: {e}")
        return ""

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "meetingmind-live")
