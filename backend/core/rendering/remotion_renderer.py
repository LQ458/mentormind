"""
Remotion Renderer Service
Renders humanities/social science animations using the Remotion (React) engine.
Triggers `npx remotion render` with dynamic props.
"""

import os
import json
import logging
import subprocess
from typing import Optional, Dict
from datetime import datetime
from config.config import config
from core.modules.video_scripting import VideoScript

logger = logging.getLogger(__name__)

class RemotionService:
    """Service for rendering Remotion videos via CLI"""
    
    def __init__(self):
        self.output_dir = os.path.join(config.DATA_DIR, "videos", "remotion")
        self.web_dir = os.path.join(config.BASE_DIR, "../../web") # Assuming backend is in root/backend
        os.makedirs(self.output_dir, exist_ok=True)
        
    async def render_script(self, script: VideoScript) -> str:
        """
        Render a full video script using Remotion CLI.
        Returns the path to the final video file.
        """

        import time
        start_time = time.time()
        logger.info(f"🎨 [Remotion] Starting render for: '{script.title}'")
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(self.output_dir, f"remotion_{timestamp}.mp4")
        
        # Serialize script to JSON string for props
        # Note: For complex props, it's safer to write to a temp file and pass inputs
        props_json = json.dumps({"script": self._to_dict(script)})
        
        # Write props to a temp file to avoid command line length limits
        props_file = os.path.join(self.output_dir, f"props_{timestamp}.json")
        with open(props_file, 'w') as f:
            f.write(props_json)
            
        try:
            # npx remotion render <EntryFile> <CompositionID> <OutName> --props=...
            cmd = [
                "npx",
                "remotion",
                "render",
                "remotion/index.ts",
                "LessonVideo",
                output_path,
                f"--props={props_file}"
            ]
            
            logger.info(f"Executing Remotion in {self.web_dir}")
            
            # Using shell=False is safer, but need to ensure npx is in PATH
            # Run blocking subprocess in a separate thread to avoid blocking the event loop
            import asyncio
            
            def run_remotion():
                return subprocess.run(
                    cmd,
                    cwd=self.web_dir,
                    check=True,
                    capture_output=True,
                    text=True,
                    env={**os.environ, "PATH": os.environ["PATH"]}
                )

            result = await asyncio.to_thread(run_remotion)
            
            if os.path.exists(output_path):
                duration = time.time() - start_time
                file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
                logger.info(f"✅ [Remotion] Render successful in {duration:.2f}s | Size: {file_size_mb:.2f}MB | Path: {output_path}")
                # Clean up props file
                os.remove(props_file)
                return output_path
            else:
                 raise Exception(f"Output video not found at {output_path}")
                 
        except subprocess.CalledProcessError as e:
            logger.error(f"Remotion execution failed: {e.stderr}")
            raise Exception(f"Remotion render error: {e.stderr}")
        except Exception as e:
            logger.error(f"Render failed: {e}")
            raise

    def _to_dict(self, script: VideoScript) -> Dict:
        """Convert VideoScript dataclass to dictionary for JSON serialization"""
        return {
            "title": script.title,
            "total_duration": script.total_duration,
            "scenes": [
                {
                    "id": s.id,
                    "duration": s.duration,
                    "narration": s.narration,
                    "action": s.action,
                    "param": s.param,
                    "visual_type": s.visual_type,
                    "canvas_config": s.canvas_config,
                    "audio_path": s.audio_path.replace(config.DATA_DIR, "http://localhost:8000/api/files") if s.audio_path else None
                }
                for s in script.scenes
            ],
            "engine": script.engine
        }
