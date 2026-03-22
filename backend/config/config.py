"""
MentorMind Configuration Manager
Centralized configuration for all backend services with Chinese market optimization
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from enum import Enum


class ModelProvider(Enum):
    DEEPSEEK = "deepseek"
    ALIBABA = "alibaba"
    BAIDU = "baidu"
    OPEN_SOURCE = "open_source"


class ProcessingMode(Enum):
    LOCAL = "local"
    CLOUD_API = "cloud_api"
    HYBRID = "hybrid"


@dataclass
class ModelConfig:
    """Configuration for AI models"""
    name: str
    provider: ModelProvider
    api_key: Optional[str] = None
    endpoint: Optional[str] = None
    max_tokens: int = 4096
    temperature: float = 0.7
    cost_per_1k_tokens: float = 0.0  # USD


@dataclass
class DatabaseConfig:
    """Configuration for databases"""
    host: str
    port: int
    username: Optional[str] = None
    password: Optional[str] = None
    database: str = "mentormind_metadata"
    max_connections: int = 20


@dataclass
class ProcessingConfig:
    """Configuration for processing pipelines"""
    mode: ProcessingMode = ProcessingMode.HYBRID
    batch_size: int = 10
    timeout_seconds: int = 300
    max_retries: int = 3
    cache_enabled: bool = True


@dataclass
class CostOptimizationConfig:
    """Configuration for cost optimization"""
    monthly_budget_usd: float = 160.0
    token_cost_threshold: float = 50.0
    fallback_to_cheaper_models: bool = True
    cache_ttl_hours: int = 24


@dataclass
class StorageConfig:
    """Configuration for cloud storage (S3/R2)"""
    enabled: bool = os.getenv("S3_ENABLED", "false").lower() == "true"
    endpoint_url: Optional[str] = os.getenv("S3_ENDPOINT_URL")
    access_key: Optional[str] = os.getenv("S3_ACCESS_KEY_ID")
    secret_key: Optional[str] = os.getenv("S3_SECRET_ACCESS_KEY")
    bucket_name: str = os.getenv("S3_BUCKET_NAME", "mentormind-videos")
    public_url_prefix: Optional[str] = os.getenv("S3_PUBLIC_URL_PREFIX")


class MentorMindConfig:
    """
    Main configuration class for MentorMind backend service
    All variables controlled from this single file
    """
    
    # ===== PROJECT METADATA =====
    PROJECT_NAME: str = "MentorMind"
    VERSION: str = "1.0"
    TARGET_MARKET: str = "China"
    DEPLOYMENT_ENV: str = os.getenv("MENTORMIND_ENV", "development")
    VERIFY_SSL: bool = os.getenv("VERIFY_SSL", "true").lower() == "true"
    
    # ===== MODEL CONFIGURATIONS =====
    @classmethod
    def get_models(cls) -> Dict[str, ModelConfig]:
        """Get model configurations"""
        return {
            "deepseek_v3": ModelConfig(
                name="DeepSeek-V3",
                provider=ModelProvider.DEEPSEEK,
                api_key=os.getenv("DEEPSEEK_API_KEY"),
                endpoint="https://api.deepseek.com/v1/chat/completions",
                max_tokens=8192,
                temperature=0.3,
                cost_per_1k_tokens=0.001  # $0.001 per 1K tokens
            ),
            "deepseek_r1": ModelConfig(
                name="DeepSeek-R1",
                provider=ModelProvider.DEEPSEEK,
                api_key=os.getenv("DEEPSEEK_API_KEY"),
                endpoint="https://api.deepseek.com/v1/chat/completions",
                max_tokens=4096,
                temperature=0.1,  # Lower temp for reasoning
                cost_per_1k_tokens=0.002  # Slightly more expensive for reasoning
            ),
            "funasr": ModelConfig(
                name="FunASR-Paraformer",
                provider=ModelProvider.ALIBABA,
                endpoint=os.getenv("FUNASR_ENDPOINT", "http://localhost:10095"),
                cost_per_1k_tokens=0.0005
            ),
            "paddle_ocr": ModelConfig(
                name="PaddleOCR",
                provider=ModelProvider.BAIDU,
                endpoint=os.getenv("PADDLE_OCR_ENDPOINT", "http://localhost:8866"),
                cost_per_1k_tokens=0.0003
            )
        }
    
    # ===== DATABASE CONFIGURATIONS =====
    @classmethod
    def get_databases(cls) -> Dict[str, DatabaseConfig]:
        """Get database configurations"""
        return {
            "nebula_graph": DatabaseConfig(
                host=os.getenv("NEBULA_HOST", "localhost"),
                port=int(os.getenv("NEBULA_PORT", "9669")),
                username=os.getenv("NEBULA_USER", "root"),
                password=os.getenv("NEBULA_PASSWORD", "nebula"),
                database="mentormind_graph"
            ),
            "milvus": DatabaseConfig(
                host=os.getenv("MILVUS_HOST", "localhost"),
                port=int(os.getenv("MILVUS_PORT", "19530")),
                database="mentormind_vectors"
            ),
            "postgres": DatabaseConfig(
                host=os.getenv("POSTGRES_HOST", "localhost"),
                port=int(os.getenv("POSTGRES_PORT", "5432")),
                username=os.getenv("POSTGRES_USER", "mentormind"),
                password=os.getenv("POSTGRES_PASSWORD", "mentormind"),
                database="mentormind_metadata"
            )
        }
    
    # ===== PROCESSING CONFIGURATIONS =====
    PROCESSING: ProcessingConfig = ProcessingConfig(
        mode=ProcessingMode.HYBRID,
        batch_size=10,
        timeout_seconds=300,
        max_retries=3,
        cache_enabled=True
    )
    
    # ===== COST OPTIMIZATION =====
    COST_OPTIMIZATION: CostOptimizationConfig = CostOptimizationConfig(
        monthly_budget_usd=160.0,
        token_cost_threshold=50.0,
        fallback_to_cheaper_models=True,
        cache_ttl_hours=24
    )
    
    # ===== STORAGE =====
    STORAGE: StorageConfig = StorageConfig()
    
    # ===== MODULE-SPECIFIC CONFIGURATIONS =====
    
    # Multimodal Ingestion
    AUDIO_SAMPLE_RATE: int = 16000
    VIDEO_FRAME_RATE: int = 30
    SCENE_CHANGE_THRESHOLD: float = 0.3
    CONTEXT_BLOCK_SIZE: int = 512  # tokens per context block
    
    # Cognitive Processing
    KNOWLEDGE_GRAPH_ENTITY_TYPES: List[str] = ["concept", "formula", "theorem", "example", "pitfall", "prerequisite"]
    RELATIONSHIP_TYPES: List[str] = ["depends_on", "is_a", "part_of", "contradicts", "generalizes", "specializes"]
    
    # Agentic Workflow
    PLANNER_MAX_STEPS: int = 5
    CRITIC_QUALITY_THRESHOLD: float = 0.8
    MAX_REGENERATION_ATTEMPTS: int = 3
    
    # Output Generation
    AVATAR_IMAGE_PATH: str = "./assets/teacher_avatar.png"
    TTS_VOICE: str = "FunAudioLLM/CosyVoice2-0.5B"
    TTS_VOICE_LABEL: str = "anna"
    VIDEO_FPS: int = 25
    
    # ===== PATHS AND DIRECTORIES =====
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DATA_DIR: str = os.path.join(BASE_DIR, "data")
    MODELS_DIR: str = os.path.join(BASE_DIR, "models")
    LOGS_DIR: str = os.path.join(BASE_DIR, "logs")
    CACHE_DIR: str = os.path.join(BASE_DIR, ".cache")
    
    # ===== VALIDATION METHODS =====
    
    @classmethod
    def validate_config(cls) -> List[str]:
        """Validate configuration and return list of warnings"""
        warnings = []
        
        # Check required environment variables
        if not os.getenv("DEEPSEEK_API_KEY"):
            warnings.append("DEEPSEEK_API_KEY not set - DeepSeek models will not work")
        
        # Check cost constraints
        total_estimated_cost = sum(
            model.cost_per_1k_tokens * 1000  # Estimate for 1M tokens
            for model in cls.get_models().values()
        )
        if total_estimated_cost > cls.COST_OPTIMIZATION.monthly_budget_usd:
            warnings.append(f"Estimated model costs (${total_estimated_cost:.2f}) exceed monthly budget (${cls.COST_OPTIMIZATION.monthly_budget_usd})")
        
        # Check directory permissions
        for directory in [cls.DATA_DIR, cls.LOGS_DIR, cls.CACHE_DIR]:
            if not os.path.exists(directory):
                try:
                    os.makedirs(directory, exist_ok=True)
                except PermissionError:
                    warnings.append(f"Cannot create directory: {directory}")
        
        return warnings
    
    @classmethod
    def get_model_cost_summary(cls) -> Dict[str, float]:
        """Get cost summary for all models"""
        return {
            model_name: model.cost_per_1k_tokens
            for model_name, model in cls.get_models().items()
        }
    
    @classmethod
    def get_cheapest_model(cls, task_type: str = "general") -> ModelConfig:
        """Get the cheapest model for a given task type"""
        models = cls.get_models()
        if task_type == "reasoning":
            return models["deepseek_r1"]
        elif task_type == "asr":
            return models["funasr"]
        elif task_type == "ocr":
            return models["paddle_ocr"]
        else:
            # Return cheapest general model
            return min(models.values(), key=lambda m: m.cost_per_1k_tokens)


# Global configuration instance
config = MentorMindConfig()