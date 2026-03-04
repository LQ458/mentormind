"""
SiliconFlow API Service
Reference: https://docs.siliconflow.cn/reference
"""

import aiohttp
import asyncio
import os
import json
import logging
from typing import Dict, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)

class SiliconFlowService:
    """Client for SiliconFlow AI Video Generation API"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("SILICONFLOW_API_KEY")
        self.base_url = "https://api.siliconflow.cn/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
    async def check_availability(self) -> bool:
        """Check if service is configured and available"""
        if not self.api_key:
            return False
            
        try:
            # Simple health check endpoint (user info)
            connector = aiohttp.TCPConnector(verify_ssl=config.VERIFY_SSL)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.get(f"{self.base_url}/user/info", headers=self.headers) as response:
                    return response.status == 200
        except Exception as e:
            logger.error(f"SiliconFlow availability check failed: {e}")
            return False

    async def generate_video(
        self,
        prompt: str,
        image_url: Optional[str] = None,
        model: str = "Wan-AI/Wan2.1-T2V-1.3B" # Using a standard text-to-video model found
    ) -> Dict:
        """
        Generate video using SiliconFlow API
        """
        if not self.api_key:
            raise ValueError("SILICONFLOW_API_KEY is not set")
            
        url = f"{self.base_url}/video/submit"
        
        payload = {
            "model": model,
            "prompt": prompt,
        }
        
        if image_url:
            payload["image"] = image_url
            payload["model"] = "Wan-AI/Wan2.1-I2V-14B-720P" # Image-to-Video model

        try:
            connector = aiohttp.TCPConnector(verify_ssl=config.VERIFY_SSL)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.post(url, headers=self.headers, json=payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise Exception(f"SiliconFlow API error {response.status}: {error_text}")
                        
                    data = await response.json()
                    return {
                        "video_id": data["requestId"],
                        "status_url": f"{self.base_url}/video/status"
                    }
                    
        except Exception as e:
            logger.error(f"Failed to generate video with SiliconFlow: {e}")
            raise

    async def wait_for_completion(self, request_id: str, poll_interval: int = 5, timeout: int = 300) -> Optional[str]:
        """Wait for video generation to complete"""
        url = f"{self.base_url}/video/status"
        payload = {"requestId": request_id}
        start_time = datetime.now()
        
        async with aiohttp.ClientSession() as session:
            while (datetime.now() - start_time).seconds < timeout:
                async with session.post(url, headers=self.headers, json=payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.warning(f"Error polling status: {error_text}")
                    else:
                        data = await response.json()
                        status = data.get("status")
                        
                        if status == "Succeed":
                            results = data.get("results", {})
                            videos = results.get("videos", [])
                            if videos:
                                return videos[0].get("url")
                        elif status == "Failed":
                            raise Exception(f"Video generation failed: {data.get('reason')}")
                    
                    await asyncio.sleep(poll_interval)
            
            raise TimeoutError("Video generation timed out")
