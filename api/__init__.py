"""
API 层 - 提供统一的 API 接口

这个包包含：
- 搜索 API 接口
- Webhook 处理
- GitHub Actions 执行器
- 状态管理 API
"""

from .search_api import SearchAPI
from .webhook_handler import WebhookHandler

__all__ = [
    "SearchAPI",
    "WebhookHandler"
]

__version__ = "0.1.0" 