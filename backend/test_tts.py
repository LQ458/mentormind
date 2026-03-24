import asyncio
import os
from backend.services.siliconflow_tts import SiliconFlowTTSService

async def test_voices():
    # Make sure we have the API key
    from dotenv import load_dotenv
    load_dotenv(os.path.join("backend", ".env"))
    
    tts = SiliconFlowTTSService()
    
    voices_to_test = ["anna", "alex", "lucy", "michael", "diana", "caleb", "ben"]
    
    for voice in voices_to_test:
        try:
            print(f"Testing voice: {voice}...")
            res = await tts.text_to_speech("Hello, this is a test.", voice_label=voice, output_path=f"test_{voice}.mp3")
            print(f"Success for {voice}: {res.duration}s")
        except Exception as e:
            print(f"Failed for {voice}: {e}")

if __name__ == "__main__":
    asyncio.run(test_voices())
