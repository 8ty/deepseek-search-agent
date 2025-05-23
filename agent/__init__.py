"""
DeepSeek Search Agent - 核心搜索代理模块

这个包包含了搜索代理的核心功能：
- 搜索代理主类
- 搜索和抓取工具
- AI 模型接口
- 工具函数
"""

from .search_agent import SearchAgent
from .tools import SearchTool, ScrapTool
from .models import OpenRouterModel
from .workspace import Workspace

__all__ = [
    "SearchAgent",
    "SearchTool", 
    "ScrapTool",
    "OpenRouterModel",
    "Workspace"
]

__version__ = "0.1.0" 