"""
工作空间模块
管理搜索状态、内存块和搜索历史
"""

import json
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime
from .utils import generate_unique_id, segment_text


class MemoryBlock:
    """内存块类，存储搜索相关信息"""
    
    def __init__(self, block_id: str, block_type: str, content: Any, metadata: Dict[str, Any] = None):
        self.id = block_id
        self.type = block_type
        self.content = content
        self.metadata = metadata or {}
        self.created_at = datetime.now()
        self.updated_at = self.created_at

    def update(self, content: Any = None, metadata: Dict[str, Any] = None):
        """更新内存块"""
        if content is not None:
            self.content = content
        if metadata is not None:
            self.metadata.update(metadata)
        self.updated_at = datetime.now()

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "type": self.type,
            "content": self.content,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MemoryBlock":
        """从字典创建内存块"""
        block = cls(
            block_id=data["id"],
            block_type=data["type"],
            content=data["content"],
            metadata=data.get("metadata", {})
        )
        block.created_at = datetime.fromisoformat(data["created_at"])
        block.updated_at = datetime.fromisoformat(data["updated_at"])
        return block


class Workspace:
    """工作空间类，管理搜索代理的状态和内存"""
    
    def __init__(self, workspace_id: Optional[str] = None):
        self.id = workspace_id or generate_unique_id(prefix="ws")
        self.memory_blocks: Dict[str, MemoryBlock] = {}
        self.search_history: List[Dict[str, Any]] = []
        self.current_search_id: Optional[str] = None
        self.status = "ready"  # ready, searching, error, completed
        self.created_at = datetime.now()
        self.updated_at = self.created_at

    def add_memory_block(self, block_type: str, content: Any, metadata: Dict[str, Any] = None) -> str:
        """添加内存块"""
        block_id = generate_unique_id(
            existing_ids=set(self.memory_blocks.keys()), 
            prefix=block_type[:3]
        )
        
        block = MemoryBlock(block_id, block_type, content, metadata)
        self.memory_blocks[block_id] = block
        self._update_timestamp()
        
        return block_id

    def get_memory_block(self, block_id: str) -> Optional[MemoryBlock]:
        """获取内存块"""
        return self.memory_blocks.get(block_id)

    def update_memory_block(self, block_id: str, content: Any = None, metadata: Dict[str, Any] = None) -> bool:
        """更新内存块"""
        if block_id in self.memory_blocks:
            self.memory_blocks[block_id].update(content, metadata)
            self._update_timestamp()
            return True
        return False

    def remove_memory_block(self, block_id: str) -> bool:
        """删除内存块"""
        if block_id in self.memory_blocks:
            del self.memory_blocks[block_id]
            self._update_timestamp()
            return True
        return False

    def get_memory_blocks_by_type(self, block_type: str) -> List[MemoryBlock]:
        """根据类型获取内存块"""
        return [block for block in self.memory_blocks.values() if block.type == block_type]

    def add_search_record(self, query: str, search_id: str, status: str = "started"):
        """添加搜索记录"""
        record = {
            "search_id": search_id,
            "query": query,
            "status": status,
            "started_at": datetime.now().isoformat(),
            "completed_at": None,
            "results_count": 0
        }
        self.search_history.append(record)
        self.current_search_id = search_id
        self._update_timestamp()

    def update_search_record(self, search_id: str, **updates):
        """更新搜索记录"""
        for record in self.search_history:
            if record["search_id"] == search_id:
                record.update(updates)
                if updates.get("status") == "completed":
                    record["completed_at"] = datetime.now().isoformat()
                break
        self._update_timestamp()

    def get_search_record(self, search_id: str) -> Optional[Dict[str, Any]]:
        """获取搜索记录"""
        for record in self.search_history:
            if record["search_id"] == search_id:
                return record
        return None

    def set_status(self, status: str):
        """设置工作空间状态"""
        self.status = status
        self._update_timestamp()

    def clear_memory(self):
        """清空内存"""
        self.memory_blocks.clear()
        self._update_timestamp()

    def get_summary(self) -> Dict[str, Any]:
        """获取工作空间摘要"""
        return {
            "id": self.id,
            "status": self.status,
            "memory_blocks_count": len(self.memory_blocks),
            "search_history_count": len(self.search_history),
            "current_search_id": self.current_search_id,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "status": self.status,
            "memory_blocks": {bid: block.to_dict() for bid, block in self.memory_blocks.items()},
            "search_history": self.search_history,
            "current_search_id": self.current_search_id,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Workspace":
        """从字典创建工作空间"""
        workspace = cls(data["id"])
        workspace.status = data["status"]
        workspace.search_history = data["search_history"]
        workspace.current_search_id = data.get("current_search_id")
        workspace.created_at = datetime.fromisoformat(data["created_at"])
        workspace.updated_at = datetime.fromisoformat(data["updated_at"])
        
        # 恢复内存块
        for bid, block_data in data["memory_blocks"].items():
            workspace.memory_blocks[bid] = MemoryBlock.from_dict(block_data)
        
        return workspace

    def _update_timestamp(self):
        """更新时间戳"""
        self.updated_at = datetime.now()


class WorkspaceManager:
    """工作空间管理器"""
    
    def __init__(self):
        self.workspaces: Dict[str, Workspace] = {}

    def create_workspace(self, workspace_id: Optional[str] = None) -> Workspace:
        """创建新工作空间"""
        workspace = Workspace(workspace_id)
        self.workspaces[workspace.id] = workspace
        return workspace

    def get_workspace(self, workspace_id: str) -> Optional[Workspace]:
        """获取工作空间"""
        return self.workspaces.get(workspace_id)

    def remove_workspace(self, workspace_id: str) -> bool:
        """删除工作空间"""
        if workspace_id in self.workspaces:
            del self.workspaces[workspace_id]
            return True
        return False

    def list_workspaces(self) -> List[str]:
        """列出所有工作空间 ID"""
        return list(self.workspaces.keys())

    def cleanup_inactive_workspaces(self, max_age_hours: int = 24):
        """清理不活跃的工作空间"""
        import time
        current_time = datetime.now()
        to_remove = []
        
        for workspace_id, workspace in self.workspaces.items():
            age_hours = (current_time - workspace.updated_at).total_seconds() / 3600
            if age_hours > max_age_hours:
                to_remove.append(workspace_id)
        
        for workspace_id in to_remove:
            del self.workspaces[workspace_id]
        
        return len(to_remove)


# 全局工作空间管理器实例
_workspace_manager = WorkspaceManager()

def get_workspace_manager() -> WorkspaceManager:
    """获取全局工作空间管理器"""
    return _workspace_manager 