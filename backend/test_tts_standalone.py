import requests
import os
import json
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("SILICONFLOW_API_KEY")
if not api_key:
    print("NO API KEY!")
    exit(1)

url = "https://api.siliconflow.cn/v1/audio/speech"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

voices_to_test = ["alex", "anna", "lucy", "michael", "diana", "caleb", "ben"]

for voice in voices_to_test:
    payload = {
        "model": "FunAudioLLM/CosyVoice2-0.5B",
        "input": "Hello, testing this voice.",
        "voice": f"FunAudioLLM/CosyVoice2-0.5B:{voice}",
        "response_format": "mp3"
    }
    
    response = requests.post(url, headers=headers, json=payload)
    if response.status_code == 200:
        print(f"SUCCESS: {voice}")
    else:
        print(f"FAILED: {voice} - {response.text}")

