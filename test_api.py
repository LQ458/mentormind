import urllib.request
import json
import os

env_vars = {}
with open('.env') as f:
    for line in f:
        if line.startswith('SILICONFLOW_API_KEY'):
            env_vars['SILICONFLOW_API_KEY'] = line.strip().split('=', 1)[1]

api_key = env_vars.get('SILICONFLOW_API_KEY', '').strip('"').strip("'")

url = "https://api.siliconflow.cn/v1/audio/speech"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

voices_to_test = ["alex", "anna", "lucy", "michael", "diana", "caleb", "ben"]

for voice in voices_to_test:
    data = json.dumps({
        "model": "FunAudioLLM/CosyVoice2-0.5B",
        "input": "Hello",
        "voice": f"FunAudioLLM/CosyVoice2-0.5B:{voice}",
        "response_format": "mp3"
    }).encode('utf-8')
    
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        urllib.request.urlopen(req)
        print(f"SUCCESS: {voice}")
    except urllib.error.HTTPError as e:
        err = e.read().decode('utf-8')
        print(f"FAILED: {voice} - {e.code} {err}")
