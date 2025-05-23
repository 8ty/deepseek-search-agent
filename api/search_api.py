"""
搜索 API 接口
为前端和其他客户端提供搜索功能的 API 接口
"""

import json
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime

from agent import SearchAgent
from config.settings import get_settings


class SearchAPI:
    """搜索 API 接口类"""
    
    def __init__(self, callback_url: Optional[str] = None):
        self.settings = get_settings()
        self.agent = SearchAgent(callback_url=callback_url)

    async def trigger_search(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """触发搜索"""
        try:
            query = request_data.get("query")
            if not query:
                return {
                    "error": "查询参数缺失",
                    "code": "MISSING_QUERY"
                }
            
            # 可选参数
            workspace_id = request_data.get("workspace_id")
            max_results = request_data.get("max_results", 10)
            include_scraping = request_data.get("include_scraping", True)
            callback_url = request_data.get("callback_url")
            
            # 更新回调 URL（如果提供）
            if callback_url:
                self.agent.callback_url = callback_url
            
            # 异步执行搜索
            asyncio.create_task(self._execute_search_async(
                query, workspace_id, max_results, include_scraping
            ))
            
            # 立即返回搜索已开始的响应
            return {
                "status": "search_initiated",
                "message": "搜索已开始，结果将通过回调发送",
                "query": query,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "error": f"启动搜索失败: {str(e)}",
                "code": "SEARCH_INIT_FAILED"
            }

    async def _execute_search_async(
        self, 
        query: str, 
        workspace_id: Optional[str], 
        max_results: int, 
        include_scraping: bool
    ):
        """异步执行搜索"""
        try:
            result = await self.agent.search(
                query=query,
                workspace_id=workspace_id,
                max_results=max_results,
                include_scraping=include_scraping
            )
            return result
        except Exception as e:
            print(f"搜索执行失败: {e}")
            # 错误已经在 agent 中处理，这里只是记录

    async def get_search_status(self, search_id: str, workspace_id: str) -> Dict[str, Any]:
        """获取搜索状态"""
        try:
            return await self.agent.get_search_status(search_id, workspace_id)
        except Exception as e:
            return {
                "error": f"获取搜索状态失败: {str(e)}",
                "code": "STATUS_FETCH_FAILED"
            }

    async def get_search_results(self, search_id: str, workspace_id: str) -> Dict[str, Any]:
        """获取搜索结果"""
        try:
            return await self.agent.get_search_results(search_id, workspace_id)
        except Exception as e:
            return {
                "error": f"获取搜索结果失败: {str(e)}",
                "code": "RESULTS_FETCH_FAILED"
            }

    async def list_workspaces(self) -> Dict[str, Any]:
        """列出所有工作空间"""
        try:
            workspaces = self.agent.workspace_manager.list_workspaces()
            workspace_summaries = []
            
            for workspace_id in workspaces:
                workspace = self.agent.workspace_manager.get_workspace(workspace_id)
                if workspace:
                    workspace_summaries.append(workspace.get_summary())
            
            return {
                "workspaces": workspace_summaries,
                "count": len(workspace_summaries)
            }
        except Exception as e:
            return {
                "error": f"获取工作空间列表失败: {str(e)}",
                "code": "WORKSPACE_LIST_FAILED"
            }

    async def get_workspace_info(self, workspace_id: str) -> Dict[str, Any]:
        """获取工作空间信息"""
        try:
            workspace = self.agent.workspace_manager.get_workspace(workspace_id)
            if not workspace:
                return {
                    "error": "工作空间不存在",
                    "code": "WORKSPACE_NOT_FOUND"
                }
            
            return {
                "workspace": workspace.to_dict()
            }
        except Exception as e:
            return {
                "error": f"获取工作空间信息失败: {str(e)}",
                "code": "WORKSPACE_INFO_FAILED"
            }

    async def create_workspace(self, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        """创建新工作空间"""
        try:
            workspace = self.agent.workspace_manager.create_workspace(workspace_id)
            return {
                "workspace": workspace.get_summary(),
                "message": "工作空间创建成功"
            }
        except Exception as e:
            return {
                "error": f"创建工作空间失败: {str(e)}",
                "code": "WORKSPACE_CREATE_FAILED"
            }

    async def delete_workspace(self, workspace_id: str) -> Dict[str, Any]:
        """删除工作空间"""
        try:
            success = self.agent.workspace_manager.remove_workspace(workspace_id)
            if success:
                return {
                    "message": "工作空间删除成功",
                    "workspace_id": workspace_id
                }
            else:
                return {
                    "error": "工作空间不存在",
                    "code": "WORKSPACE_NOT_FOUND"
                }
        except Exception as e:
            return {
                "error": f"删除工作空间失败: {str(e)}",
                "code": "WORKSPACE_DELETE_FAILED"
            }

    async def cleanup_workspaces(self, max_age_hours: int = 24) -> Dict[str, Any]:
        """清理不活跃的工作空间"""
        try:
            removed_count = self.agent.workspace_manager.cleanup_inactive_workspaces(max_age_hours)
            return {
                "message": f"清理完成，删除了 {removed_count} 个不活跃的工作空间",
                "removed_count": removed_count,
                "max_age_hours": max_age_hours
            }
        except Exception as e:
            return {
                "error": f"清理工作空间失败: {str(e)}",
                "code": "WORKSPACE_CLEANUP_FAILED"
            }


# 创建默认 API 实例
def create_search_api(callback_url: Optional[str] = None) -> SearchAPI:
    """创建搜索 API 实例"""
    return SearchAPI(callback_url) 