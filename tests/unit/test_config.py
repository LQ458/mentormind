"""
Unit Tests – MentorMind Configuration
=======================================

Tests cover:
  • ModelConfig, DatabaseConfig, ProcessingConfig, CostOptimizationConfig dataclass defaults
  • MentorMindConfig class attributes (PROJECT_NAME, VERSION, TARGET_MARKET)
  • get_models() expected keys
  • get_databases() expected keys
  • get_cheapest_model() routing per task type
  • get_model_cost_summary() completeness
  • validate_config() warning when SILICONFLOW_API_KEY is absent
"""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest


# ─────────────────────────────────────────────────────────────────────────────
# ModelConfig defaults
# ─────────────────────────────────────────────────────────────────────────────

class TestModelConfigDefaults:

    def test_max_tokens_default(self):
        from config.config import ModelConfig, ModelProvider
        cfg = ModelConfig(name="test", provider=ModelProvider.DEEPSEEK)
        assert cfg.max_tokens == 4096

    def test_temperature_default(self):
        from config.config import ModelConfig, ModelProvider
        cfg = ModelConfig(name="test", provider=ModelProvider.DEEPSEEK)
        assert cfg.temperature == 0.7

    def test_cost_per_1k_tokens_default(self):
        from config.config import ModelConfig, ModelProvider
        cfg = ModelConfig(name="test", provider=ModelProvider.DEEPSEEK)
        assert cfg.cost_per_1k_tokens == 0.0

    def test_api_key_default_is_none(self):
        from config.config import ModelConfig, ModelProvider
        cfg = ModelConfig(name="test", provider=ModelProvider.OPEN_SOURCE)
        assert cfg.api_key is None

    def test_endpoint_default_is_none(self):
        from config.config import ModelConfig, ModelProvider
        cfg = ModelConfig(name="test", provider=ModelProvider.OPEN_SOURCE)
        assert cfg.endpoint is None

    def test_explicit_values_stored(self):
        from config.config import ModelConfig, ModelProvider
        cfg = ModelConfig(
            name="MyModel",
            provider=ModelProvider.ALIBABA,
            api_key="sk-abc",
            endpoint="https://example.com",
            max_tokens=2048,
            temperature=0.5,
            cost_per_1k_tokens=0.01,
        )
        assert cfg.name == "MyModel"
        assert cfg.provider == ModelProvider.ALIBABA
        assert cfg.api_key == "sk-abc"
        assert cfg.endpoint == "https://example.com"
        assert cfg.max_tokens == 2048
        assert cfg.temperature == 0.5
        assert cfg.cost_per_1k_tokens == 0.01


# ─────────────────────────────────────────────────────────────────────────────
# DatabaseConfig defaults
# ─────────────────────────────────────────────────────────────────────────────

class TestDatabaseConfigDefaults:

    def test_database_name_default(self):
        from config.config import DatabaseConfig
        cfg = DatabaseConfig(host="localhost", port=5432)
        assert cfg.database == "mentormind_metadata"

    def test_max_connections_default(self):
        from config.config import DatabaseConfig
        cfg = DatabaseConfig(host="localhost", port=5432)
        assert cfg.max_connections == 20

    def test_username_default_is_none(self):
        from config.config import DatabaseConfig
        cfg = DatabaseConfig(host="localhost", port=5432)
        assert cfg.username is None

    def test_password_default_is_none(self):
        from config.config import DatabaseConfig
        cfg = DatabaseConfig(host="localhost", port=5432)
        assert cfg.password is None

    def test_explicit_values_stored(self):
        from config.config import DatabaseConfig
        cfg = DatabaseConfig(
            host="db.example.com",
            port=5433,
            username="admin",
            password="secret",
            database="mydb",
            max_connections=50,
        )
        assert cfg.host == "db.example.com"
        assert cfg.port == 5433
        assert cfg.username == "admin"
        assert cfg.password == "secret"
        assert cfg.database == "mydb"
        assert cfg.max_connections == 50


# ─────────────────────────────────────────────────────────────────────────────
# ProcessingConfig defaults
# ─────────────────────────────────────────────────────────────────────────────

class TestProcessingConfigDefaults:

    def test_mode_default_is_hybrid(self):
        from config.config import ProcessingConfig, ProcessingMode
        cfg = ProcessingConfig()
        assert cfg.mode == ProcessingMode.HYBRID

    def test_batch_size_default(self):
        from config.config import ProcessingConfig
        cfg = ProcessingConfig()
        assert cfg.batch_size == 10

    def test_timeout_seconds_default(self):
        from config.config import ProcessingConfig
        cfg = ProcessingConfig()
        assert cfg.timeout_seconds == 300

    def test_max_retries_default(self):
        from config.config import ProcessingConfig
        cfg = ProcessingConfig()
        assert cfg.max_retries == 3

    def test_cache_enabled_default(self):
        from config.config import ProcessingConfig
        cfg = ProcessingConfig()
        assert cfg.cache_enabled is True


# ─────────────────────────────────────────────────────────────────────────────
# CostOptimizationConfig defaults
# ─────────────────────────────────────────────────────────────────────────────

class TestCostOptimizationConfigDefaults:

    def test_monthly_budget_usd_default(self):
        from config.config import CostOptimizationConfig
        cfg = CostOptimizationConfig()
        assert cfg.monthly_budget_usd == 160.0

    def test_token_cost_threshold_default(self):
        from config.config import CostOptimizationConfig
        cfg = CostOptimizationConfig()
        assert cfg.token_cost_threshold == 50.0

    def test_fallback_to_cheaper_models_default(self):
        from config.config import CostOptimizationConfig
        cfg = CostOptimizationConfig()
        assert cfg.fallback_to_cheaper_models is True

    def test_cache_ttl_hours_default(self):
        from config.config import CostOptimizationConfig
        cfg = CostOptimizationConfig()
        assert cfg.cache_ttl_hours == 24


# ─────────────────────────────────────────────────────────────────────────────
# MentorMindConfig class attributes
# ─────────────────────────────────────────────────────────────────────────────

class TestMentorMindConfigAttributes:

    def test_project_name(self):
        from config.config import MentorMindConfig
        assert MentorMindConfig.PROJECT_NAME == "MentorMind"

    def test_version(self):
        from config.config import MentorMindConfig
        assert MentorMindConfig.VERSION == "1.0"

    def test_target_market(self):
        from config.config import MentorMindConfig
        assert MentorMindConfig.TARGET_MARKET == "China"


# ─────────────────────────────────────────────────────────────────────────────
# get_models()
# ─────────────────────────────────────────────────────────────────────────────

class TestGetModels:

    def test_returns_dict(self):
        from config.config import MentorMindConfig
        models = MentorMindConfig.get_models()
        assert isinstance(models, dict)

    def test_contains_deepseek_v3(self):
        from config.config import MentorMindConfig
        assert "deepseek_v3" in MentorMindConfig.get_models()

    def test_contains_deepseek_r1(self):
        from config.config import MentorMindConfig
        assert "deepseek_r1" in MentorMindConfig.get_models()

    def test_contains_funasr(self):
        from config.config import MentorMindConfig
        assert "funasr" in MentorMindConfig.get_models()

    def test_contains_paddle_ocr(self):
        from config.config import MentorMindConfig
        assert "paddle_ocr" in MentorMindConfig.get_models()

    def test_all_values_are_model_config(self):
        from config.config import MentorMindConfig, ModelConfig
        for key, val in MentorMindConfig.get_models().items():
            assert isinstance(val, ModelConfig), f"Expected ModelConfig for key {key!r}"


# ─────────────────────────────────────────────────────────────────────────────
# get_databases()
# ─────────────────────────────────────────────────────────────────────────────

class TestGetDatabases:

    def test_returns_dict(self):
        from config.config import MentorMindConfig
        dbs = MentorMindConfig.get_databases()
        assert isinstance(dbs, dict)

    def test_contains_nebula_graph(self):
        from config.config import MentorMindConfig
        assert "nebula_graph" in MentorMindConfig.get_databases()

    def test_contains_milvus(self):
        from config.config import MentorMindConfig
        assert "milvus" in MentorMindConfig.get_databases()

    def test_contains_postgres(self):
        from config.config import MentorMindConfig
        assert "postgres" in MentorMindConfig.get_databases()

    def test_all_values_are_database_config(self):
        from config.config import MentorMindConfig, DatabaseConfig
        for key, val in MentorMindConfig.get_databases().items():
            assert isinstance(val, DatabaseConfig), f"Expected DatabaseConfig for key {key!r}"


# ─────────────────────────────────────────────────────────────────────────────
# get_cheapest_model()
# ─────────────────────────────────────────────────────────────────────────────

class TestGetCheapestModel:

    def test_reasoning_returns_deepseek_r1(self):
        from config.config import MentorMindConfig
        model = MentorMindConfig.get_cheapest_model("reasoning")
        assert model.name == "DeepSeek-R1"

    def test_asr_returns_funasr(self):
        from config.config import MentorMindConfig
        model = MentorMindConfig.get_cheapest_model("asr")
        assert model.name == "FunASR-Paraformer"

    def test_ocr_returns_paddle_ocr(self):
        from config.config import MentorMindConfig
        model = MentorMindConfig.get_cheapest_model("ocr")
        assert model.name == "PaddleOCR"

    def test_general_returns_model_with_lowest_cost(self):
        from config.config import MentorMindConfig
        model = MentorMindConfig.get_cheapest_model("general")
        all_models = MentorMindConfig.get_models()
        min_cost = min(m.cost_per_1k_tokens for m in all_models.values())
        assert model.cost_per_1k_tokens == min_cost

    def test_unknown_task_type_returns_model_config(self):
        from config.config import MentorMindConfig, ModelConfig
        model = MentorMindConfig.get_cheapest_model("unknown_task")
        assert isinstance(model, ModelConfig)

    def test_default_task_type_returns_model_config(self):
        from config.config import MentorMindConfig, ModelConfig
        model = MentorMindConfig.get_cheapest_model()
        assert isinstance(model, ModelConfig)


# ─────────────────────────────────────────────────────────────────────────────
# get_model_cost_summary()
# ─────────────────────────────────────────────────────────────────────────────

class TestGetModelCostSummary:

    def test_returns_dict(self):
        from config.config import MentorMindConfig
        summary = MentorMindConfig.get_model_cost_summary()
        assert isinstance(summary, dict)

    def test_contains_all_model_names(self):
        from config.config import MentorMindConfig
        summary = MentorMindConfig.get_model_cost_summary()
        expected_keys = set(MentorMindConfig.get_models().keys())
        assert set(summary.keys()) == expected_keys

    def test_values_are_floats(self):
        from config.config import MentorMindConfig
        summary = MentorMindConfig.get_model_cost_summary()
        for key, val in summary.items():
            assert isinstance(val, float), f"Expected float cost for {key!r}, got {type(val)}"

    def test_deepseek_v3_cost_present(self):
        from config.config import MentorMindConfig
        summary = MentorMindConfig.get_model_cost_summary()
        assert "deepseek_v3" in summary

    def test_paddle_ocr_cost_present(self):
        from config.config import MentorMindConfig
        summary = MentorMindConfig.get_model_cost_summary()
        assert "paddle_ocr" in summary


# ─────────────────────────────────────────────────────────────────────────────
# validate_config()
# ─────────────────────────────────────────────────────────────────────────────

class TestValidateConfig:

    def test_returns_list(self):
        from config.config import MentorMindConfig
        result = MentorMindConfig.validate_config()
        assert isinstance(result, list)

    def test_warns_when_siliconflow_api_key_missing(self):
        from config.config import MentorMindConfig
        saved = os.environ.pop("SILICONFLOW_API_KEY", None)
        try:
            warnings = MentorMindConfig.validate_config()
            messages = " ".join(warnings)
            assert "SILICONFLOW_API_KEY" in messages, (
                f"Expected SILICONFLOW_API_KEY warning, got: {warnings}"
            )
        finally:
            if saved is not None:
                os.environ["SILICONFLOW_API_KEY"] = saved

    def test_no_siliconflow_warning_when_key_present(self):
        from config.config import MentorMindConfig
        os.environ["SILICONFLOW_API_KEY"] = "sk-test-key"
        try:
            warnings = MentorMindConfig.validate_config()
            siliconflow_warnings = [w for w in warnings if "SILICONFLOW_API_KEY" in w]
            assert siliconflow_warnings == [], (
                f"Unexpected SILICONFLOW_API_KEY warning when key is set: {siliconflow_warnings}"
            )
        finally:
            del os.environ["SILICONFLOW_API_KEY"]

    def test_each_warning_is_string(self):
        from config.config import MentorMindConfig
        warnings = MentorMindConfig.validate_config()
        for w in warnings:
            assert isinstance(w, str), f"Expected str warning, got {type(w)}: {w!r}"


# ─────────────────────────────────────────────────────────────────────────────
# Enum smoke tests
# ─────────────────────────────────────────────────────────────────────────────

class TestEnums:

    def test_model_provider_values(self):
        from config.config import ModelProvider
        assert ModelProvider.DEEPSEEK.value == "deepseek"
        assert ModelProvider.ALIBABA.value == "alibaba"
        assert ModelProvider.BAIDU.value == "baidu"
        assert ModelProvider.OPEN_SOURCE.value == "open_source"

    def test_processing_mode_values(self):
        from config.config import ProcessingMode
        assert ProcessingMode.LOCAL.value == "local"
        assert ProcessingMode.CLOUD_API.value == "cloud_api"
        assert ProcessingMode.HYBRID.value == "hybrid"
