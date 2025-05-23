"""
Webhook 处理器
处理来自前端和外部系统的 Webhook 请求
"""

import json
import hmac
import hashlib
from typing import Dict, Any, Optional
from datetime import datetime

from .search_api import SearchAPI
from config.settings import get_settings


class WebhookHandler:
    """Webhook 处理器"""
    
    def __init__(self, secret_key: Optional[str] = None):
        self.settings = get_settings()
        self.api = SearchAPI()
        self.secret_key = secret_key

    def verify_signature(self, payload: bytes, signature: str) -> bool:
        """验证 Webhook 签名"""
        if not self.secret_key:
            return True  # 如果没有设置密钥，则跳过验证
        
        expected_signature = hmac.new(
            self.secret_key.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(f"sha256={expected_signature}", signature)

    async def handle_search_trigger(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """处理搜索触发 Webhook"""
        try:
            return await self.api.trigger_search(data)
        except Exception as e:
            return {
                "error": f"处理搜索触发失败: {str(e)}",
                "code": "WEBHOOK_SEARCH_FAILED"
            }

    async def handle_search_status(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """处理搜索状态查询 Webhook"""
        try:
            search_id = data.get("search_id")
            workspace_id = data.get("workspace_id")
            
            if not search_id or not workspace_id:
                return {
                    "error": "缺少 search_id 或 workspace_id 参数",
                    "code": "MISSING_PARAMETERS"
                }
            
            return await self.api.get_search_status(search_id, workspace_id)
        except Exception as e:
            return {
                "error": f"处理状态查询失败: {str(e)}",
                "code": "WEBHOOK_STATUS_FAILED"
            }

    async def handle_search_results(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """处理搜索结果查询 Webhook"""
        try:
            search_id = data.get("search_id")
            workspace_id = data.get("workspace_id")
            
            if not search_id or not workspace_id:
                return {
                    "error": "缺少 search_id 或 workspace_id 参数",
                    "code": "MISSING_PARAMETERS"
                }
            
            return await self.api.get_search_results(search_id, workspace_id)
        except Exception as e:
            return {
                "error": f"处理结果查询失败: {str(e)}",
                "code": "WEBHOOK_RESULTS_FAILED"
            }

    async def handle_workspace_management(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """处理工作空间管理 Webhook"""
        try:
            action = data.get("action")
            
            if action == "list":
                return await self.api.list_workspaces()
            elif action == "create":
                workspace_id = data.get("workspace_id")
                return await self.api.create_workspace(workspace_id)
            elif action == "delete":
                workspace_id = data.get("workspace_id")
                if not workspace_id:
                    return {
                        "error": "缺少 workspace_id 参数",
                        "code": "MISSING_WORKSPACE_ID"
                    }
                return await self.api.delete_workspace(workspace_id)
            elif action == "info":
                workspace_id = data.get("workspace_id")
                if not workspace_id:
                    return {
                        "error": "缺少 workspace_id 参数",
                        "code": "MISSING_WORKSPACE_ID"
                    }
                return await self.api.get_workspace_info(workspace_id)
            elif action == "cleanup":
                max_age_hours = data.get("max_age_hours", 24)
                return await self.api.cleanup_workspaces(max_age_hours)
            else:
                return {
                    "error": f"未知的工作空间操作: {action}",
                    "code": "UNKNOWN_ACTION"
                }
        except Exception as e:
            return {
                "error": f"处理工作空间管理失败: {str(e)}",
                "code": "WEBHOOK_WORKSPACE_FAILED"
            }

    async def handle_webhook(self, event_type: str, data: Dict[str, Any], signature: Optional[str] = None) -> Dict[str, Any]:
        """处理 Webhook 请求的主入口"""
        
        # 记录请求
        print(f"📡 收到 Webhook: {event_type}")
        print(f"📄 数据: {json.dumps(data, ensure_ascii=False, indent=2)}")
        
        # 验证签名（如果提供）
        if signature and not self.verify_signature(json.dumps(data).encode(), signature):
            return {
                "error": "Webhook 签名验证失败",
                "code": "INVALID_SIGNATURE"
            }
        
        # 路由到对应的处理器
        try:
            if event_type == "search.trigger":
                return await self.handle_search_trigger(data)
            elif event_type == "search.status":
                return await self.handle_search_status(data)
            elif event_type == "search.results":
                return await self.handle_search_results(data)
            elif event_type == "workspace.manage":
                return await self.handle_workspace_management(data)
            else:
                return {
                    "error": f"未知的事件类型: {event_type}",
                    "code": "UNKNOWN_EVENT_TYPE"
                }
        except Exception as e:
            return {
                "error": f"处理 Webhook 失败: {str(e)}",
                "code": "WEBHOOK_HANDLER_ERROR",
                "timestamp": datetime.now().isoformat()
            }

    def get_webhook_info(self) -> Dict[str, Any]:
        """获取 Webhook 信息"""
        return {
            "supported_events": [
                "search.trigger",
                "search.status", 
                "search.results",
                "workspace.manage"
            ],
            "signature_required": bool(self.secret_key),
            "timestamp": datetime.now().isoformat()
        }


# 创建默认处理器
def create_webhook_handler(secret_key: Optional[str] = None) -> WebhookHandler:
    """创建 Webhook 处理器"""
    return WebhookHandler(secret_key) 