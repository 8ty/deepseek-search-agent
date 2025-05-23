"""
设置管理模块
统一管理应用程序的所有配置项
"""

import os
from typing import Optional, Dict, Any
from dataclasses import dataclass, field


@dataclass
class APIConfig:
    """API 配置"""
    openrouter_api_key: Optional[str] = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1/chat/completions"
    openrouter_model: str = "deepseek/deepseek-r1:free"
    
    jina_api_key: Optional[str] = None
    jina_search_base_url: str = "https://s.jina.ai"
    jina_reader_base_url: str = "https://r.jina.ai"
    
    def __post_init__(self):
        # 从环境变量自动填充
        if not self.openrouter_api_key:
            self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
        if not self.jina_api_key:
            self.jina_api_key = os.getenv("JINA_API_KEY")


@dataclass 
class SearchConfig:
    """搜索配置"""
    max_results_default: int = 10
    max_scrape_pages: int = 3
    search_timeout: int = 30
    scrape_timeout: int = 60
    enable_scraping_default: bool = True
    reasoning_effort: str = "low"  # low, medium, high
    
    # 文本处理配置
    chunk_size: int = 1000
    chunk_overlap: int = 500
    max_memory_blocks: int = 100


@dataclass
class WorkspaceConfig:
    """工作空间配置"""
    max_age_hours: int = 24
    cleanup_interval_hours: int = 6
    max_workspaces: int = 1000
    auto_cleanup: bool = True


@dataclass
class ServerConfig:
    """服务器配置"""
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    log_level: str = "INFO"
    
    # CORS 配置
    cors_origins: list = field(default_factory=lambda: ["*"])
    cors_methods: list = field(default_factory=lambda: ["*"])
    cors_headers: list = field(default_factory=lambda: ["*"])
    
    def __post_init__(self):
        # 从环境变量覆盖
        self.host = os.getenv("HOST", self.host)
        self.port = int(os.getenv("PORT", str(self.port)))
        self.debug = os.getenv("DEBUG", "false").lower() == "true"
        self.log_level = os.getenv("LOG_LEVEL", self.log_level)


@dataclass
class GitHubConfig:
    """GitHub Actions 配置"""
    repository: Optional[str] = None
    ref: Optional[str] = None
    sha: Optional[str] = None
    actions_enabled: bool = False
    runner_os: Optional[str] = None
    
    def __post_init__(self):
        # 从环境变量自动填充
        self.repository = os.getenv("GITHUB_REPOSITORY")
        self.ref = os.getenv("GITHUB_REF")
        self.sha = os.getenv("GITHUB_SHA")
        self.actions_enabled = os.getenv("GITHUB_ACTIONS") == "true"
        self.runner_os = os.getenv("RUNNER_OS")


@dataclass
class Settings:
    """主设置类"""
    api: APIConfig = field(default_factory=APIConfig)
    search: SearchConfig = field(default_factory=SearchConfig)
    workspace: WorkspaceConfig = field(default_factory=WorkspaceConfig)
    server: ServerConfig = field(default_factory=ServerConfig)
    github: GitHubConfig = field(default_factory=GitHubConfig)
    
    # 应用信息
    app_name: str = "DeepSeek Search Agent"
    app_version: str = "0.1.0"
    environment: str = "development"
    
    def __post_init__(self):
        # 从环境变量覆盖
        self.environment = os.getenv("ENVIRONMENT", self.environment)
        
        # 根据环境调整配置
        if self.environment == "production":
            self.server.debug = False
            self.server.log_level = "WARNING"
        elif self.environment == "development":
            self.server.debug = True
            self.server.log_level = "DEBUG"

    def validate(self) -> tuple[bool, list[str]]:
        """验证配置"""
        errors = []
        
        # 验证 API 密钥
        if not self.api.openrouter_api_key:
            errors.append("缺少 OpenRouter API 密钥")
        
        if not self.api.jina_api_key:
            errors.append("缺少 Jina API 密钥")
        
        # 验证数值配置
        if self.search.max_results_default <= 0:
            errors.append("搜索结果数量必须大于 0")
        
        if self.workspace.max_age_hours <= 0:
            errors.append("工作空间最大存活时间必须大于 0")
        
        if self.server.port <= 0 or self.server.port > 65535:
            errors.append("服务器端口必须在 1-65535 范围内")
        
        return len(errors) == 0, errors

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "app_name": self.app_name,
            "app_version": self.app_version,
            "environment": self.environment,
            "api": {
                "openrouter_model": self.api.openrouter_model,
                "openrouter_base_url": self.api.openrouter_base_url,
                "jina_search_base_url": self.api.jina_search_base_url,
                "jina_reader_base_url": self.api.jina_reader_base_url,
                "has_openrouter_key": bool(self.api.openrouter_api_key),
                "has_jina_key": bool(self.api.jina_api_key)
            },
            "search": {
                "max_results_default": self.search.max_results_default,
                "max_scrape_pages": self.search.max_scrape_pages,
                "search_timeout": self.search.search_timeout,
                "scrape_timeout": self.search.scrape_timeout,
                "enable_scraping_default": self.search.enable_scraping_default,
                "reasoning_effort": self.search.reasoning_effort
            },
            "workspace": {
                "max_age_hours": self.workspace.max_age_hours,
                "cleanup_interval_hours": self.workspace.cleanup_interval_hours,
                "max_workspaces": self.workspace.max_workspaces,
                "auto_cleanup": self.workspace.auto_cleanup
            },
            "server": {
                "host": self.server.host,
                "port": self.server.port,
                "debug": self.server.debug,
                "log_level": self.server.log_level
            },
            "github": {
                "repository": self.github.repository,
                "actions_enabled": self.github.actions_enabled,
                "runner_os": self.github.runner_os
            }
        }

    @classmethod
    def from_env(cls) -> "Settings":
        """从环境变量创建设置"""
        return cls()

    def get_api_keys(self) -> Dict[str, Optional[str]]:
        """获取 API 密钥（用于调试）"""
        return {
            "openrouter": self.api.openrouter_api_key,
            "jina": self.api.jina_api_key
        }


# 全局设置实例
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """获取全局设置实例"""
    global _settings
    if _settings is None:
        _settings = Settings.from_env()
    return _settings


def reload_settings() -> Settings:
    """重新加载设置"""
    global _settings
    _settings = Settings.from_env()
    return _settings


def update_settings(**kwargs) -> Settings:
    """更新设置"""
    settings = get_settings()
    
    for key, value in kwargs.items():
        if hasattr(settings, key):
            setattr(settings, key, value)
        else:
            # 尝试更新子配置
            for config_name in ["api", "search", "workspace", "server", "github"]:
                config = getattr(settings, config_name)
                if hasattr(config, key):
                    setattr(config, key, value)
                    break
    
    return settings


# 环境检查函数
def check_environment() -> Dict[str, Any]:
    """检查环境状态"""
    settings = get_settings()
    is_valid, errors = settings.validate()
    
    return {
        "valid": is_valid,
        "errors": errors,
        "settings": settings.to_dict(),
        "environment_vars": {
            "OPENROUTER_API_KEY": bool(os.getenv("OPENROUTER_API_KEY")),
            "JINA_API_KEY": bool(os.getenv("JINA_API_KEY")),
            "GITHUB_ACTIONS": os.getenv("GITHUB_ACTIONS"),
            "ENVIRONMENT": os.getenv("ENVIRONMENT")
        }
    } 