"""
Multi-Source Image Integration for Educational Content
Fetches relevant images from Wikipedia, Unsplash, and Pixabay
"""

import os
import aiohttp
import asyncio
import logging
import hashlib
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from urllib.parse import quote
import json
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class ImageSource:
    """Container for image source information"""
    url: str
    attribution: str
    license: str
    relevance_score: float
    source: str  # "wikipedia", "unsplash", "pixabay"
    title: str = ""
    description: str = ""
    local_path: str = ""


class MultiSourceImageManager:
    """
    Manages image fetching from multiple sources with caching and attribution
    """
    
    def __init__(self):
        self.cache_dir = Path("data/images/cache")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # API keys from environment
        self.unsplash_key = os.getenv("UNSPLASH_ACCESS_KEY")
        self.pixabay_key = os.getenv("PIXABAY_API_KEY")
        
        # Image search endpoints
        self.endpoints = {
            "wikipedia": "https://en.wikipedia.org/w/api.php",
            "unsplash": "https://api.unsplash.com/search/photos",
            "pixabay": "https://pixabay.com/api/"
        }
        
        # Educational keywords to enhance search
        self.educational_keywords = {
            "photosynthesis": ["plant", "chloroplast", "leaf", "sunlight", "carbon dioxide"],
            "chemistry": ["molecule", "atom", "reaction", "laboratory", "experiment"],
            "physics": ["wave", "energy", "force", "motion", "gravity"],
            "biology": ["cell", "organism", "anatomy", "evolution", "ecosystem"],
            "mathematics": ["equation", "graph", "geometry", "calculation"],
            "history": ["historical", "ancient", "civilization", "monument", "artifact"],
            "geography": ["map", "landscape", "continent", "climate", "terrain"]
        }
    
    async def find_relevant_images(self, topic: str, context: str = "", max_images: int = 5) -> List[ImageSource]:
        """
        Find relevant educational images from multiple sources
        """
        logger.info(f"🖼️  [ImageManager] Finding images for topic: '{topic}'")
        
        # Enhance search with educational context
        search_keywords = self._generate_search_keywords(topic, context)
        
        # Search all available sources in parallel
        search_tasks = []
        
        # Wikipedia images (always available)
        search_tasks.append(self._search_wikipedia_images(search_keywords, max_images))
        
        # Commercial APIs (if keys available)
        if self.unsplash_key:
            search_tasks.append(self._search_unsplash_images(search_keywords, max_images))
        
        if self.pixabay_key:
            search_tasks.append(self._search_pixabay_images(search_keywords, max_images))
        
        # Gather results from all sources
        all_results = await asyncio.gather(*search_tasks, return_exceptions=True)
        
        # Combine and rank results
        combined_images = []
        for result in all_results:
            if isinstance(result, list):
                combined_images.extend(result)
            elif isinstance(result, Exception):
                logger.warning(f"⚠️  [ImageManager] Search failed: {result}")
        
        # Sort by relevance and return top results
        combined_images.sort(key=lambda x: x.relevance_score, reverse=True)
        
        # Download and cache top images
        top_images = combined_images[:max_images]
        cached_images = await self._download_and_cache_images(top_images)
        
        logger.info(f"✅ [ImageManager] Found {len(cached_images)} relevant images")
        return cached_images
    
    async def _search_wikipedia_images(self, keywords: List[str], max_results: int) -> List[ImageSource]:
        """Search Wikipedia/Wikimedia for educational images"""
        images = []
        
        try:
            async with aiohttp.ClientSession() as session:
                for keyword in keywords[:3]:  # Limit API calls
                    params = {
                        "action": "query",
                        "format": "json",
                        "generator": "search",
                        "gsrnamespace": "6",  # File namespace
                        "gsrsearch": f"filetype:bitmap {keyword}",
                        "gsrlimit": "10",
                        "prop": "imageinfo",
                        "iiprop": "url|size|mime"
                    }
                    
                    async with session.get(self.endpoints["wikipedia"], params=params) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            pages = data.get("query", {}).get("pages", {})
                            
                            for page_id, page in pages.items():
                                imageinfo = page.get("imageinfo", [])
                                if imageinfo:
                                    image_data = imageinfo[0]
                                    
                                    # Filter appropriate images
                                    if (image_data.get("mime", "").startswith("image/") and
                                        image_data.get("size", 0) > 10000):  # Minimum size
                                        
                                        images.append(ImageSource(
                                            url=image_data["url"],
                                            attribution=f"Wikimedia Commons - {page.get('title', '')}",
                                            license="CC-BY-SA or Public Domain",
                                            relevance_score=self._calculate_relevance(page.get("title", ""), keywords),
                                            source="wikipedia",
                                            title=page.get("title", ""),
                                            description=f"Educational image from Wikipedia"
                                        ))
        
        except Exception as e:
            logger.error(f"❌ [ImageManager] Wikipedia search failed: {e}")
        
        return images[:max_results]
    
    async def _search_unsplash_images(self, keywords: List[str], max_results: int) -> List[ImageSource]:
        """Search Unsplash for high-quality educational images"""
        if not self.unsplash_key:
            return []
        
        images = []
        
        try:
            headers = {"Authorization": f"Client-ID {self.unsplash_key}"}
            
            async with aiohttp.ClientSession(headers=headers) as session:
                for keyword in keywords[:2]:  # Rate limit consideration
                    params = {
                        "query": f"{keyword} education",
                        "per_page": "10",
                        "orientation": "landscape"
                    }
                    
                    async with session.get(self.endpoints["unsplash"], params=params) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            
                            for photo in data.get("results", []):
                                images.append(ImageSource(
                                    url=photo["urls"]["regular"],
                                    attribution=f"Photo by {photo['user']['name']} on Unsplash",
                                    license="Unsplash License",
                                    relevance_score=self._calculate_relevance(photo.get("description", ""), keywords),
                                    source="unsplash",
                                    title=photo.get("alt_description", ""),
                                    description=photo.get("description", "")
                                ))
        
        except Exception as e:
            logger.error(f"❌ [ImageManager] Unsplash search failed: {e}")
        
        return images[:max_results]
    
    async def _search_pixabay_images(self, keywords: List[str], max_results: int) -> List[ImageSource]:
        """Search Pixabay for royalty-free educational images"""
        if not self.pixabay_key:
            return []
        
        images = []
        
        try:
            async with aiohttp.ClientSession() as session:
                for keyword in keywords[:2]:  # Rate limit consideration
                    params = {
                        "key": self.pixabay_key,
                        "q": f"{keyword} education",
                        "image_type": "photo",
                        "orientation": "horizontal",
                        "category": "education",
                        "min_width": "640",
                        "per_page": "10"
                    }
                    
                    async with session.get(self.endpoints["pixabay"], params=params) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            
                            for hit in data.get("hits", []):
                                images.append(ImageSource(
                                    url=hit["webformatURL"],
                                    attribution="Pixabay License (Free for commercial use)",
                                    license="Pixabay License",
                                    relevance_score=self._calculate_relevance(hit.get("tags", ""), keywords),
                                    source="pixabay",
                                    title=hit.get("tags", ""),
                                    description=f"Educational image from Pixabay"
                                ))
        
        except Exception as e:
            logger.error(f"❌ [ImageManager] Pixabay search failed: {e}")
        
        return images[:max_results]
    
    def _generate_search_keywords(self, topic: str, context: str) -> List[str]:
        """Generate enhanced search keywords for educational content"""
        keywords = [topic.lower()]
        
        # Add topic-specific educational keywords
        for subject, related_terms in self.educational_keywords.items():
            if subject in topic.lower():
                keywords.extend(related_terms[:3])  # Limit to avoid too many requests
        
        # Extract key terms from context
        if context:
            context_words = context.lower().split()
            educational_terms = [word for word in context_words 
                               if len(word) > 4 and word not in ["with", "that", "this", "have", "been"]]
            keywords.extend(educational_terms[:3])
        
        # Remove duplicates while preserving order
        unique_keywords = []
        for keyword in keywords:
            if keyword not in unique_keywords:
                unique_keywords.append(keyword)
        
        return unique_keywords[:5]  # Limit total keywords
    
    def _calculate_relevance(self, image_info: str, keywords: List[str]) -> float:
        """Calculate relevance score based on keyword matching"""
        if not image_info:
            return 0.5  # Default score
        
        image_info_lower = image_info.lower()
        score = 0.0
        
        for i, keyword in enumerate(keywords):
            if keyword in image_info_lower:
                # Higher score for earlier (more important) keywords
                weight = 1.0 - (i * 0.1)
                score += weight
        
        # Bonus for educational context
        educational_terms = ["education", "learning", "study", "academic", "school", "university"]
        for term in educational_terms:
            if term in image_info_lower:
                score += 0.2
        
        return min(1.0, score)  # Cap at 1.0
    
    async def _download_and_cache_images(self, images: List[ImageSource]) -> List[ImageSource]:
        """Download images and cache them locally"""
        cached_images = []
        
        async with aiohttp.ClientSession() as session:
            for image in images:
                try:
                    # Generate cache filename
                    url_hash = hashlib.md5(image.url.encode()).hexdigest()
                    file_extension = self._get_file_extension(image.url)
                    cache_filename = f"{url_hash}{file_extension}"
                    cache_path = self.cache_dir / cache_filename
                    
                    # Download if not cached
                    if not cache_path.exists():
                        async with session.get(image.url) as resp:
                            if resp.status == 200:
                                content = await resp.read()
                                
                                # Validate image content
                                if len(content) > 1000:  # Minimum file size
                                    with open(cache_path, 'wb') as f:
                                        f.write(content)
                                    
                                    logger.info(f"📥 [ImageManager] Cached: {cache_filename}")
                    
                    # Update image with local path
                    if cache_path.exists():
                        image.local_path = str(cache_path)
                        cached_images.append(image)
                
                except Exception as e:
                    logger.warning(f"⚠️  [ImageManager] Failed to cache image {image.url}: {e}")
        
        return cached_images
    
    def _get_file_extension(self, url: str) -> str:
        """Extract file extension from URL"""
        if url.endswith('.jpg') or url.endswith('.jpeg'):
            return '.jpg'
        elif url.endswith('.png'):
            return '.png'
        elif url.endswith('.gif'):
            return '.gif'
        else:
            return '.jpg'  # Default
    
    async def get_cached_images(self, topic: str) -> List[ImageSource]:
        """Get previously cached images for a topic"""
        # This could be enhanced with a database for better organization
        cached_files = list(self.cache_dir.glob("*.jpg")) + list(self.cache_dir.glob("*.png"))
        
        images = []
        for file_path in cached_files[:5]:  # Return up to 5 cached images
            images.append(ImageSource(
                url="",
                attribution="Cached educational image",
                license="Various",
                relevance_score=0.5,
                source="cache",
                title=f"Cached: {file_path.stem}",
                local_path=str(file_path)
            ))
        
        return images


# Integration functions
async def get_educational_images(topic: str, context: str = "", max_images: int = 3) -> List[ImageSource]:
    """
    Get relevant educational images for a topic
    """
    manager = MultiSourceImageManager()
    return await manager.find_relevant_images(topic, context, max_images)


async def get_photosynthesis_images() -> List[ImageSource]:
    """
    Specific function for photosynthesis educational images
    """
    context = "chloroplast Calvin cycle plant leaf sunlight carbon dioxide oxygen glucose"
    return await get_educational_images("photosynthesis", context, 4)


if __name__ == "__main__":
    # Test the image manager
    async def test_image_search():
        images = await get_photosynthesis_images()
        
        print(f"Found {len(images)} images for photosynthesis:")
        for img in images:
            print(f"  {img.source}: {img.title[:50]}...")
            print(f"    Score: {img.relevance_score:.2f}")
            print(f"    Attribution: {img.attribution}")
            if img.local_path:
                print(f"    Cached: {img.local_path}")
            print()
    
    asyncio.run(test_image_search())