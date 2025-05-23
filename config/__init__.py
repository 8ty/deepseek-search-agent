"""
配置管理包

提供统一的配置管理：
- 环境变量配置
- API 密钥管理
- 应用设置
"""

from .settings import Settings, get_settings

__all__ = [
    "Settings",
    "get_settings"
]

__version__ = "0.1.0" 