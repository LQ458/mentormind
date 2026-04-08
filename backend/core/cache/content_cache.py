"""
High-performance content caching for video generation
"""
import json
import hashlib
import time
from typing import Dict, Any, Optional
from pathlib import Path

class ContentCache:
    """Smart caching system for generated content"""
    
    def __init__(self, cache_dir: str = "data/cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.memory_cache = {}  # In-memory cache for recent items
        self.max_memory_items = 50
        
    def _get_cache_key(self, topic: str, style: str, stage: str, **kwargs) -> str:
        """Generate unique cache key"""
        content = f"{topic}:{style}:{stage}:{json.dumps(kwargs, sort_keys=True)}"
        return hashlib.sha256(content.encode()).hexdigest()[:16]
    
    def get(self, topic: str, style: str, stage: str, **kwargs) -> Optional[Dict[str, Any]]:
        """Get cached content"""
        key = self._get_cache_key(topic, style, stage, **kwargs)
        
        # Check memory cache first
        if key in self.memory_cache:
            item = self.memory_cache[key]
            if time.time() - item['timestamp'] < 3600:  # 1 hour TTL
                print(f"🔥 Cache HIT (memory): {stage} for {topic}")
                return item['data']
        
        # Check disk cache
        cache_file = self.cache_dir / f"{key}.json"
        if cache_file.exists():
            try:
                with open(cache_file, 'r') as f:
                    item = json.load(f)
                    if time.time() - item['timestamp'] < 24 * 3600:  # 24 hour TTL
                        print(f"💾 Cache HIT (disk): {stage} for {topic}")
                        # Store in memory for next time
                        self._store_memory(key, item['data'])
                        return item['data']
            except Exception as e:
                print(f"Cache read error: {e}")
        
        return None
    
    def set(self, topic: str, style: str, stage: str, data: Dict[str, Any], **kwargs):
        """Store content in cache"""
        key = self._get_cache_key(topic, style, stage, **kwargs)
        
        # Store in memory
        self._store_memory(key, data)
        
        # Store on disk
        try:
            cache_file = self.cache_dir / f"{key}.json"
            item = {
                'data': data,
                'timestamp': time.time(),
                'topic': topic,
                'style': style,
                'stage': stage
            }
            with open(cache_file, 'w') as f:
                json.dump(item, f, indent=2)
            print(f"💾 Cached: {stage} for {topic}")
        except Exception as e:
            print(f"Cache write error: {e}")
    
    def _store_memory(self, key: str, data: Dict[str, Any]):
        """Store in memory cache with size limit"""
        if len(self.memory_cache) >= self.max_memory_items:
            # Remove oldest item
            oldest_key = min(self.memory_cache.keys(), 
                           key=lambda k: self.memory_cache[k]['timestamp'])
            del self.memory_cache[oldest_key]
        
        self.memory_cache[key] = {
            'data': data,
            'timestamp': time.time()
        }
    
    def clear_expired(self):
        """Clear expired cache entries"""
        current_time = time.time()
        
        # Clear memory cache
        expired_keys = [k for k, v in self.memory_cache.items() 
                       if current_time - v['timestamp'] > 3600]
        for key in expired_keys:
            del self.memory_cache[key]
        
        # Clear disk cache
        for cache_file in self.cache_dir.glob("*.json"):
            try:
                with open(cache_file, 'r') as f:
                    item = json.load(f)
                    if current_time - item['timestamp'] > 24 * 3600:
                        cache_file.unlink()
            except Exception:
                pass

# Global cache instance
content_cache = ContentCache()