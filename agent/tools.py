"""
搜索和抓取工具模块
包含 Jina 搜索和网页抓取工具
"""

import os
import aiohttp
from typing import Dict, Any, Optional, List
from abc import ABC, abstractmethod


class BaseTool(ABC):
    """工具基类"""
    
    @abstractmethod
    async def execute(self, *args, **kwargs) -> Any:
        """执行工具"""
        pass


class SearchTool(BaseTool):
    """搜索工具，使用 Jina AI API"""
    
    def __init__(self, api_key: Optional[str] = None, base_url: str = "https://s.jina.ai"):
        self.api_key = api_key or os.getenv("JINA_API_KEY")
        self.base_url = base_url
        
        if not self.api_key:
            raise ValueError("Jina API key is required")

    def _get_headers(self) -> Dict[str, str]:
        """获取请求头"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }

    async def search(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        """执行搜索"""
        url = f"{self.base_url}/{query}"
        headers = self._get_headers()
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, params={"retainImages": "true"}) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Search API request failed with status {response.status}: {error_text}")
                
                return await response.json()

    async def execute(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        """执行搜索工具"""
        return await self.search(query, top_k)


class ScrapTool(BaseTool):
    """网页抓取工具，使用 Jina AI Reader API"""
    
    def __init__(self, api_key: Optional[str] = None, base_url: str = "https://r.jina.ai"):
        self.api_key = api_key or os.getenv("JINA_API_KEY")
        self.base_url = base_url
        
        if not self.api_key:
            raise ValueError("Jina API key is required")

    def _get_headers(self) -> Dict[str, str]:
        """获取请求头"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }

    async def scrape(self, url: str, include_links: bool = True) -> Dict[str, Any]:
        """抓取网页内容"""
        scrape_url = f"{self.base_url}/{url}"
        headers = self._get_headers()
        params = {}
        
        if include_links:
            params["includeLinks"] = "true"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(scrape_url, headers=headers, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Scrape API request failed with status {response.status}: {error_text}")
                
                return await response.json()

    async def execute(self, url: str, include_links: bool = True) -> Dict[str, Any]:
        """执行抓取工具"""
        return await self.scrape(url, include_links)


class ToolManager:
    """工具管理器"""
    
    def __init__(self, jina_api_key: Optional[str] = None):
        self.search_tool = SearchTool(jina_api_key)
        self.scrap_tool = ScrapTool(jina_api_key)
        
        # 工具注册表
        self._tools = {
            "search": self.search_tool,
            "scrape": self.scrap_tool,
        }

    def get_tool(self, name: str) -> BaseTool:
        """获取工具"""
        if name not in self._tools:
            raise ValueError(f"Unknown tool: {name}")
        return self._tools[name]

    def add_tool(self, name: str, tool: BaseTool):
        """添加自定义工具"""
        self._tools[name] = tool

    def list_tools(self) -> List[str]:
        """列出所有可用工具"""
        return list(self._tools.keys())

    async def execute_tool(self, name: str, *args, **kwargs) -> Any:
        """执行指定工具"""
        tool = self.get_tool(name)
        return await tool.execute(*args, **kwargs)


# 创建默认工具管理器
def create_tool_manager(jina_api_key: Optional[str] = None) -> ToolManager:
    """创建工具管理器"""
    return ToolManager(jina_api_key) 