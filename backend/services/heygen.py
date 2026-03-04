"""
HeyGen API Service
Reference: https://docs.heygen.com/reference/create-an-avatar-video-v2
"""

import aiohttp
import asyncio
import os
import json
import logging
from typing import Dict, Optional, List
from datetime import datetime

from config.config import config

logger = logging.getLogger(__name__)

class HeyGenService:
    """Client for HeyGen AI Video Generation API"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("HEYGEN_API_KEY")
        self.base_url = "https://api.heygen.com"
        self.headers = {
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json"
        }
        
    async def check_availability(self) -> bool:
        """Check if service is configured and available"""
        if not self.api_key:
            return False
            
        try:
            # Simple health check endpoint or list avatars to verify key
            connector = aiohttp.TCPConnector(verify_ssl=config.VERIFY_SSL)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.get(f"{self.base_url}/v2/avatars", headers=self.headers) as response:
                    return response.status == 200
        except Exception as e:
            logger.error(f"HeyGen availability check failed: {e}")
            return False

    async def generate_video(
        self,
        text: str,
        avatar_id: str = "Daisy-skirt-20220818",  # Default HeyGen Avatar
        voice_id: str = "1bd001e7e50f421d891986aad5158bc8",  # Default Voice
        background_color: str = "#ffffff"
    ) -> Dict:
        """
        Generate video using HeyGen v2 API
        Returns: {video_id: str, status_url: str}
        """
        if not self.api_key:
            raise ValueError("HEYGEN_API_KEY is not set")
            
        url = f"{self.base_url}/v2/video/generate"
        
        payload = {
            "video_inputs": [
                {
                    "character": {
                        "type": "avatar",
                        "avatar_id": avatar_id,
                        "avatar_style": "normal"
                    },
                    "voice": {
                        "type": "text",
                        "input_text": text,
                        "voice_id": voice_id
                    },
                    "background": {
                        "type": "color",
                        "value": background_color
                    }
                }
            ],
            "dimension": {
                "width": 1920,
                "height": 1080
            }
        }
        
        try:
            connector = aiohttp.TCPConnector(verify_ssl=config.VERIFY_SSL)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.post(url, headers=self.headers, json=payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise Exception(f"HeyGen API error {response.status}: {error_text}")
                        
                    data = await response.json()
                    if data.get("error"):
                         raise Exception(f"HeyGen API error: {data['error']}")
                         
                    return {
                        "video_id": data["data"]["video_id"],
                        "status_url": f"{self.base_url}/v1/video_status.get?video_id={data['data']['video_id']}"
                    }
                    
        except Exception as e:
            logger.error(f"Failed to generate video: {e}")
            raise

    async def check_status(self, video_id: str) -> Dict:
        """Check generation status"""
        url = f"{self.base_url}/v1/video_status.get?video_id={video_id}"
        
        connector = aiohttp.TCPConnector(verify_ssl=config.VERIFY_SSL)
        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.get(url, headers=self.headers) as response:
                data = await response.json()
                return data["data"]

    async def wait_for_completion(self, video_id: str, poll_interval: int = 5, timeout: int = 300) -> Optional[str]:
        """Wait for video generation to complete and return download URL"""
        start_time = datetime.now()
        
        while (datetime.now() - start_time).seconds < timeout:
            status_data = await self.check_status(video_id)
            status = status_data.get("status")
            
            if status == "completed":
                return status_data.get("video_url")
            elif status == "failed":
                raise Exception(f"Video generation failed: {status_data.get('error')}")
                
            await asyncio.sleep(poll_interval)
            
        raise TimeoutError("Video generation timed out")
