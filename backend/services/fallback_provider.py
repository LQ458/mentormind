"""
Multi-Provider API Fallback System
Provides resilience through multiple AI service providers
"""

import os
import aiohttp
import json
import logging
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass
import asyncio

from services.circuit_breaker import CircuitBreakerConfig, circuit_breaker_manager


@dataclass
class APIProvider:
    """Represents an AI API provider"""
    name: str
    client_func: Callable
    priority: int = 0  # Lower number = higher priority
    enabled: bool = True
    api_key_env: str = ""  # Environment variable for API key
    
    def __post_init__(self):
        # Check if API key is available
        if self.api_key_env and not os.getenv(self.api_key_env):
            self.enabled = False
            logging.getLogger(__name__).warning(
                f"Provider '{self.name}' disabled: {self.api_key_env} not found"
            )


class OpenAIProvider:
    """OpenAI API provider implementation"""
    
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.base_url = "https://api.openai.com/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        self.logger = logging.getLogger(__name__)
    
    async def chat_completion(self, messages: List[Dict], **kwargs) -> Dict[str, Any]:
        """OpenAI chat completion"""
        if not self.api_key:
            raise ValueError("OpenAI API key not available")
        
        url = f"{self.base_url}/chat/completions"
        
        payload = {
            "model": kwargs.get("model", "gpt-4"),
            "messages": messages,
            "temperature": kwargs.get("temperature", 0.7),
            "max_tokens": kwargs.get("max_tokens", 2000),
            "stream": False
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                headers=self.headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=600)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    # Convert to standard format
                    return {
                        "choices": [{
                            "message": {
                                "content": data["choices"][0]["message"]["content"]
                            }
                        }],
                        "usage": data.get("usage", {}),
                        "provider": "openai"
                    }
                else:
                    error_text = await response.text()
                    raise Exception(f"OpenAI API error {response.status}: {error_text}")


class ClaudeProvider:
    """Anthropic Claude API provider implementation"""
    
    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        self.base_url = "https://api.anthropic.com/v1"
        self.headers = {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01"
        }
        self.logger = logging.getLogger(__name__)
    
    async def chat_completion(self, messages: List[Dict], **kwargs) -> Dict[str, Any]:
        """Claude chat completion"""
        if not self.api_key:
            raise ValueError("Anthropic API key not available")
        
        url = f"{self.base_url}/messages"
        
        # Convert messages format for Claude
        claude_messages = []
        system_message = ""
        
        for msg in messages:
            if msg["role"] == "system":
                system_message = msg["content"]
            else:
                claude_messages.append(msg)
        
        payload = {
            "model": kwargs.get("model", "claude-3-sonnet-20240229"),
            "max_tokens": kwargs.get("max_tokens", 2000),
            "temperature": kwargs.get("temperature", 0.7),
            "messages": claude_messages
        }
        
        if system_message:
            payload["system"] = system_message
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                headers=self.headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=600)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    # Convert to standard format
                    return {
                        "choices": [{
                            "message": {
                                "content": data["content"][0]["text"]
                            }
                        }],
                        "usage": data.get("usage", {}),
                        "provider": "claude"
                    }
                else:
                    error_text = await response.text()
                    raise Exception(f"Claude API error {response.status}: {error_text}")


class OfflineMockProvider:
    """Offline mock provider for graceful degradation"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
    
    async def chat_completion(self, messages: List[Dict], **kwargs) -> Dict[str, Any]:
        """Mock completion for offline mode"""
        self.logger.warning("Using offline mock provider - limited functionality")
        
        # Extract topic from messages for basic template generation
        user_content = ""
        for msg in messages:
            if msg["role"] == "user":
                user_content = msg["content"]
                break
        
        # Generate basic template response
        if "video" in user_content.lower() or "教学" in user_content:
            mock_content = self._generate_video_template(user_content)
        else:
            mock_content = self._generate_basic_template(user_content)
        
        return {
            "choices": [{
                "message": {
                    "content": mock_content
                }
            }],
            "usage": {"total_tokens": len(mock_content.split())},
            "provider": "offline_mock"
        }
    
    def _generate_video_template(self, topic: str) -> str:
        """Generate basic video generation template"""
        return json.dumps({
            "title": f"Learning: {topic}",
            "scenes": [
                {
                    "id": "intro",
                    "duration": 5.0,
                    "narration": f"Welcome to this lesson about {topic}",
                    "action": "show_text",
                    "param": f"Topic: {topic}"
                },
                {
                    "id": "main",
                    "duration": 10.0,
                    "narration": f"Let's explore the key concepts of {topic}",
                    "action": "show_text",
                    "param": "Key Concepts"
                },
                {
                    "id": "conclusion",
                    "duration": 5.0,
                    "narration": "Thank you for learning with us",
                    "action": "show_text",
                    "param": "Summary"
                }
            ]
        }, ensure_ascii=False, indent=2)
    
    def _generate_basic_template(self, topic: str) -> str:
        """Generate basic response template"""
        return f"I understand you're asking about: {topic}. This is a mock response while the AI services are unavailable. Please try again later for a complete AI-generated response."


class FallbackAPIManager:
    """Manages multiple API providers with automatic fallback"""
    
    def __init__(self):
        self.providers: List[APIProvider] = []
        self.logger = logging.getLogger(__name__)
        self._setup_providers()
    
    def _setup_providers(self):
        """Initialize all available providers"""
        # Primary provider: DeepSeek (already implemented in api_client.py)
        # We'll integrate with existing DeepSeek client
        
        # Secondary provider: OpenAI
        openai_provider = OpenAIProvider()
        self.register_provider(APIProvider(
            name="openai",
            client_func=openai_provider.chat_completion,
            priority=2,
            api_key_env="OPENAI_API_KEY",
            enabled=bool(os.getenv("OPENAI_API_KEY"))
        ))
        
        # Tertiary provider: Claude
        claude_provider = ClaudeProvider()
        self.register_provider(APIProvider(
            name="claude",
            client_func=claude_provider.chat_completion,
            priority=3,
            api_key_env="ANTHROPIC_API_KEY",
            enabled=bool(os.getenv("ANTHROPIC_API_KEY"))
        ))
        
        # Offline fallback (always available)
        offline_provider = OfflineMockProvider()
        self.register_provider(APIProvider(
            name="offline_mock",
            client_func=offline_provider.chat_completion,
            priority=999,  # Lowest priority
            enabled=True
        ))
    
    def register_provider(self, provider: APIProvider):
        """Register a new provider"""
        self.providers.append(provider)
        self.providers.sort(key=lambda p: p.priority)
        
        # Set up circuit breaker for this provider
        if provider.enabled and provider.name != "offline_mock":
            cb_config = CircuitBreakerConfig(
                failure_threshold=3,
                success_threshold=2,
                timeout_duration=30,
                failure_rate_threshold=0.3
            )
            circuit_breaker_manager.get_circuit_breaker(f"provider_{provider.name}", cb_config)
        
        self.logger.info(f"Registered provider: {provider.name} (priority={provider.priority}, enabled={provider.enabled})")
    
    async def call_with_fallback(
        self, 
        messages: List[Dict], 
        **kwargs
    ) -> Dict[str, Any]:
        """Call API with automatic fallback through providers"""
        last_exception = None
        attempted_providers = []
        
        # Filter to enabled providers only
        enabled_providers = [p for p in self.providers if p.enabled]
        
        for provider in enabled_providers:
            try:
                attempted_providers.append(provider.name)
                self.logger.info(f"Attempting API call with provider: {provider.name}")
                
                # Use circuit breaker for non-offline providers
                if provider.name != "offline_mock":
                    circuit_breaker = circuit_breaker_manager.get_circuit_breaker(f"provider_{provider.name}")
                    result = await circuit_breaker.call(provider.client_func, messages, **kwargs)
                else:
                    # Direct call for offline provider
                    result = await provider.client_func(messages, **kwargs)
                
                self.logger.info(f"Success with provider: {provider.name}")
                
                # Add provider info to result
                result["provider_used"] = provider.name
                result["providers_attempted"] = attempted_providers
                
                return result
                
            except Exception as e:
                self.logger.warning(f"Provider {provider.name} failed: {e}")
                last_exception = e
                
                # For offline provider, don't continue trying (it's the last resort)
                if provider.name == "offline_mock":
                    break
                
                continue
        
        # If we get here, all providers failed
        raise Exception(
            f"All API providers failed. Attempted: {attempted_providers}. "
            f"Last error: {last_exception}"
        )
    
    def get_provider_status(self) -> Dict[str, Any]:
        """Get status of all providers"""
        status = {}
        
        for provider in self.providers:
            if provider.enabled and provider.name != "offline_mock":
                try:
                    circuit_breaker = circuit_breaker_manager.get_circuit_breaker(f"provider_{provider.name}")
                    metrics = circuit_breaker.get_metrics()
                    
                    status[provider.name] = {
                        "enabled": provider.enabled,
                        "priority": provider.priority,
                        "circuit_breaker_state": metrics["state"],
                        "failure_rate": metrics["failure_rate"],
                        "total_requests": metrics["total_requests"]
                    }
                except:
                    status[provider.name] = {
                        "enabled": provider.enabled,
                        "priority": provider.priority,
                        "status": "unknown"
                    }
            else:
                status[provider.name] = {
                    "enabled": provider.enabled,
                    "priority": provider.priority,
                    "note": "offline_provider" if provider.name == "offline_mock" else "disabled"
                }
        
        return status
    
    def get_health_summary(self) -> Dict[str, Any]:
        """Get overall fallback system health"""
        status = self.get_provider_status()
        
        total_providers = len([p for p in self.providers if p.name != "offline_mock"])
        healthy_providers = len([
            p for p, info in status.items() 
            if p != "offline_mock" and info.get("enabled") and info.get("circuit_breaker_state") == "CLOSED"
        ])
        
        return {
            "total_providers": total_providers,
            "healthy_providers": healthy_providers,
            "degraded_providers": total_providers - healthy_providers,
            "fallback_available": True,  # Offline provider always available
            "system_health": "healthy" if healthy_providers > 0 else "degraded"
        }


# Global fallback manager instance
fallback_manager = FallbackAPIManager()


# Integration function for existing DeepSeek client
async def call_with_fallback_integration(deepseek_func: Callable, messages: List[Dict], **kwargs) -> Dict[str, Any]:
    """
    Integration function to use existing DeepSeek client as primary with fallback
    """
    try:
        # Try primary DeepSeek provider first
        result = await deepseek_func(messages, **kwargs)
        if result.success:
            return result.data
        else:
            # If DeepSeek fails, use fallback system
            logging.getLogger(__name__).warning(f"DeepSeek failed: {result.error}. Trying fallback providers...")
            return await fallback_manager.call_with_fallback(messages, **kwargs)
    
    except Exception as e:
        # If DeepSeek throws exception, use fallback system
        logging.getLogger(__name__).warning(f"DeepSeek exception: {e}. Trying fallback providers...")
        return await fallback_manager.call_with_fallback(messages, **kwargs)


if __name__ == "__main__":
    async def test_fallback_system():
        """Test the fallback system"""
        manager = FallbackAPIManager()
        
        # Test messages
        test_messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "What is 2+2?"}
        ]
        
        try:
            result = await manager.call_with_fallback(test_messages)
            print(f"Success: {result}")
        except Exception as e:
            print(f"All providers failed: {e}")
        
        # Print provider status
        status = manager.get_provider_status()
        print(f"Provider status: {status}")
        
        health = manager.get_health_summary()
        print(f"System health: {health}")
    
    asyncio.run(test_fallback_system())