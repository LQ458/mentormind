
import asyncio
import logging
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from core.rendering.manim_renderer import ManimService
from core.modules.video_scripting import VideoScript, Scene

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_correction():
    print("🚀 Starting Manim Correction Test")
    
    service = ManimService()
    
    # Create a dummy script
    # The ManimService has a HARDCODED error in it right now (extra parenthesis)
    # So any script we send should trigger the error path
    msg = "This is a test of the emergency broadcast system."
    
    script = VideoScript(
        title="Test Correction",
        scenes=[
            Scene(
                id="s1",
                duration=3.0,
                narration=msg,
                action="show_text",
                param="Hello World",
                visual_type="manim"
            )
        ],
        total_duration=3.0,
        engine="manim"
    )
    
    print(f"🎬 Rendering script: {script.title}")
    
    try:
        # This await is crucial
        video_path = await service.render_script(script)
        print(f"✅ FINAL RESULT: Video rendered at {video_path}")
        
    except Exception as e:
        print(f"❌ FINAL RESULT: Failed with error: {e}")

if __name__ == "__main__":
    asyncio.run(test_correction())
