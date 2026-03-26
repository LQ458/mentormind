#!/bin/bash
API_KEY=$(grep '^SILICONFLOW_API_KEY' .env | cut -d '=' -f2 | tr -d '"' | tr -d "'")
for voice in alex anna lucy michael diana caleb ben; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST https://api.siliconflow.cn/v1/audio/speech \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "FunAudioLLM/CosyVoice2-0.5B",
      "input": "Hello",
      "voice": "FunAudioLLM/CosyVoice2-0.5B:'$voice'",
      "response_format": "mp3"
    }')
  echo "Voice $voice: $STATUS"
done
