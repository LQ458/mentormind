import os
from typing import Optional
import logging

from config import config

logger = logging.getLogger(__name__)

class CloudStorageManager:
    """Manager for uploading media assets to S3/Cloudflare R2"""
    
    def __init__(self):
        self.storage_config = config.STORAGE
        self.client = None
        
        if self.storage_config.enabled:
            try:
                import boto3  # Lazy import — only needed when S3 is enabled
                self.client = boto3.client(
                    's3',
                    endpoint_url=self.storage_config.endpoint_url,
                    aws_access_key_id=self.storage_config.access_key,
                    aws_secret_access_key=self.storage_config.secret_key,
                    region_name='auto'  # For R2 compatibility
                )
                logger.info("Cloud storage initialized successfully.")
            except Exception as e:
                logger.error(f"Failed to initialize cloud storage: {e}")
                
    async def upload_file(self, local_path: str, destination_key: str, content_type: str = "video/mp4") -> Optional[str]:
        """
        Uploads a file to cloud storage.
        Returns the public URL if successful, otherwise None.
        """
        if not self.storage_config.enabled or not self.client:
            logger.info("Cloud storage disabled, skipping upload.")
            return None
            
        if not os.path.exists(local_path):
            logger.error(f"Cannot upload file. Local path not found: {local_path}")
            return None
            
        try:
            logger.info(f"Uploading {local_path} to {destination_key}...")
            self.client.upload_file(
                local_path,
                self.storage_config.bucket_name,
                destination_key,
                ExtraArgs={'ContentType': content_type}
            )
            
            # Construct public URL
            if self.storage_config.public_url_prefix:
                public_url = f"{self.storage_config.public_url_prefix}/{destination_key}"
            else:
                public_url = f"https://{self.storage_config.bucket_name}.s3.amazonaws.com/{destination_key}"
                
            logger.info(f"Successfully uploaded to: {public_url}")
            return public_url
            
        except Exception as e:
            logger.error(f"Failed to upload to cloud storage: {e}")
            return None
