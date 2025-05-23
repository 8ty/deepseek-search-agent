"""
搜索代理主类
包含搜索代理的核心逻辑和工作流程
"""

import asyncio
import json
import aiohttp
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime
from jinja2 import Environment, BaseLoader

from .models import OpenRouterModel, BaseModel
from .tools import ToolManager, create_tool_manager
from .workspace import Workspace, get_workspace_manager
from .utils import extract_largest_json, clean_response_text, format_error, generate_unique_id


class PromptTemplate:
    """提示模板类"""
    
    def __init__(self):
        self.env = Environment(loader=BaseLoader())
        
    def get_search_prompt(self, user_query: str, memory_context: str = "") -> str:
        """获取搜索提示"""
        template = """你是一个专业的AI搜索代理，需要基于用户查询进行智能搜索和信息提取。

用户查询：{{ user_query }}

{% if memory_context %}
历史记忆：
{{ memory_context }}
{% endif %}

请按照以下步骤操作：

1. 分析用户查询，理解搜索意图
2. 生成适当的搜索关键词
3. 使用搜索工具获取相关信息
4. 如需要，使用抓取工具获取详细内容
5. 分析和整理信息
6. 生成结构化的搜索结果

请以 JSON 格式返回你的计划，包含：
{
    "search_keywords": ["关键词1", "关键词2"],
    "search_strategy": "搜索策略描述",
    "expected_sources": ["期望的信息源类型"],
    "analysis_focus": "分析重点"
}"""
        
        template_obj = self.env.from_string(template)
        return template_obj.render(user_query=user_query, memory_context=memory_context)

    def get_analysis_prompt(self, query: str, search_results: List[Dict], scraped_content: List[Dict]) -> str:
        """获取分析提示"""
        template = """基于搜索结果和抓取内容，请分析并回答用户的查询。

用户查询：{{ query }}

搜索结果摘要：
{% for result in search_results[:5] %}
- {{ result.get('title', 'No title') }}: {{ result.get('description', result.get('content', ''))[:200] }}...
{% endfor %}

详细内容：
{% for content in scraped_content %}
来源：{{ content.get('url', 'Unknown') }}
内容：{{ content.get('content', '')[:1000] }}...

{% endfor %}

请提供：
1. 对用户查询的直接回答
2. 关键信息点总结
3. 相关链接和资源
4. 如果需要，提供进一步搜索建议

以结构化的方式组织回答，确保信息准确、有用。"""
        
        template_obj = self.env.from_string(template)
        return template_obj.render(
            query=query, 
            search_results=search_results, 
            scraped_content=scraped_content
        )


class SearchAgent:
    """搜索代理主类"""
    
    def __init__(
        self,
        model: Optional[BaseModel] = None,
        tool_manager: Optional[ToolManager] = None,
        callback_url: Optional[str] = None
    ):
        self.model = model or OpenRouterModel()
        self.tool_manager = tool_manager or create_tool_manager()
        self.prompt_template = PromptTemplate()
        self.callback_url = callback_url
        self.workspace_manager = get_workspace_manager()

    async def search(
        self, 
        query: str, 
        workspace_id: Optional[str] = None,
        max_results: int = 10,
        include_scraping: bool = True
    ) -> Dict[str, Any]:
        """执行搜索"""
        
        # 创建或获取工作空间
        if workspace_id:
            workspace = self.workspace_manager.get_workspace(workspace_id)
            if not workspace:
                workspace = self.workspace_manager.create_workspace(workspace_id)
        else:
            workspace = self.workspace_manager.create_workspace()
        
        search_id = generate_unique_id(prefix="search")
        
        try:
            # 记录搜索开始
            workspace.add_search_record(query, search_id, "started")
            workspace.set_status("searching")
            
            # 发送开始回调
            if self.callback_url:
                await self._send_callback("search_started", {
                    "search_id": search_id,
                    "workspace_id": workspace.id,
                    "query": query
                })
            
            # 第一阶段：分析查询和制定搜索计划
            memory_context = self._get_memory_context(workspace)
            search_prompt = self.prompt_template.get_search_prompt(query, memory_context)
            
            plan_response = await self.model.generate(search_prompt)
            plan_response_clean = clean_response_text(plan_response)
            
            try:
                search_plan = extract_largest_json(plan_response_clean)
            except Exception as e:
                # 如果 JSON 提取失败，使用默认计划
                search_plan = {
                    "search_keywords": [query],
                    "search_strategy": "直接搜索用户查询",
                    "expected_sources": ["网页", "文档"],
                    "analysis_focus": "全面分析"
                }
            
            # 存储搜索计划
            plan_block_id = workspace.add_memory_block("search_plan", search_plan, {
                "search_id": search_id,
                "original_response": plan_response
            })
            
            # 第二阶段：执行搜索
            search_results = []
            for keyword in search_plan.get("search_keywords", [query]):
                try:
                    results = await self.tool_manager.execute_tool("search", keyword, max_results)
                    if isinstance(results, dict) and "data" in results:
                        search_results.extend(results["data"])
                    elif isinstance(results, list):
                        search_results.extend(results)
                except Exception as e:
                    print(f"搜索关键词 '{keyword}' 失败: {e}")
                    continue
            
            # 存储搜索结果
            results_block_id = workspace.add_memory_block("search_results", search_results, {
                "search_id": search_id,
                "keywords": search_plan.get("search_keywords", []),
                "results_count": len(search_results)
            })
            
            # 发送搜索完成回调
            if self.callback_url:
                await self._send_callback("search_completed", {
                    "search_id": search_id,
                    "workspace_id": workspace.id,
                    "results_count": len(search_results)
                })
            
            # 第三阶段：抓取详细内容（如果启用）
            scraped_content = []
            if include_scraping and search_results:
                # 选择前几个最相关的结果进行抓取
                top_results = search_results[:3]  # 限制抓取数量
                
                for result in top_results:
                    url = result.get("url")
                    if url:
                        try:
                            scraped = await self.tool_manager.execute_tool("scrape", url)
                            if scraped and scraped.get("data"):
                                scraped_content.append(scraped["data"])
                        except Exception as e:
                            print(f"抓取 URL '{url}' 失败: {e}")
                            continue
                
                # 存储抓取内容
                if scraped_content:
                    scraped_block_id = workspace.add_memory_block("scraped_content", scraped_content, {
                        "search_id": search_id,
                        "scraped_count": len(scraped_content)
                    })
            
            # 第四阶段：分析和生成最终回答
            analysis_prompt = self.prompt_template.get_analysis_prompt(query, search_results, scraped_content)
            final_response = await self.model.generate(analysis_prompt)
            final_response_clean = clean_response_text(final_response)
            
            # 存储最终回答
            answer_block_id = workspace.add_memory_block("final_answer", final_response_clean, {
                "search_id": search_id,
                "query": query
            })
            
            # 更新搜索记录
            workspace.update_search_record(search_id, 
                status="completed",
                results_count=len(search_results),
                scraped_count=len(scraped_content)
            )
            workspace.set_status("completed")
            
            # 构建最终结果
            final_result = {
                "search_id": search_id,
                "workspace_id": workspace.id,
                "query": query,
                "status": "completed",
                "search_plan": search_plan,
                "search_results": search_results,
                "scraped_content": scraped_content,
                "final_answer": final_response_clean,
                "memory_blocks": {
                    "plan": plan_block_id,
                    "results": results_block_id,
                    "answer": answer_block_id
                },
                "stats": {
                    "search_results_count": len(search_results),
                    "scraped_pages_count": len(scraped_content),
                    "processing_time": (datetime.now() - workspace.updated_at).total_seconds()
                }
            }
            
            # 发送完成回调
            if self.callback_url:
                await self._send_callback("search_finished", final_result)
            
            return final_result
            
        except Exception as e:
            # 错误处理
            error_info = format_error(e, f"搜索过程中发生错误: {query}")
            workspace.update_search_record(search_id, status="error", error=error_info)
            workspace.set_status("error")
            
            # 发送错误回调
            if self.callback_url:
                await self._send_callback("search_error", {
                    "search_id": search_id,
                    "workspace_id": workspace.id,
                    "error": error_info
                })
            
            raise

    def _get_memory_context(self, workspace: Workspace, max_blocks: int = 3) -> str:
        """获取内存上下文"""
        recent_blocks = sorted(
            workspace.memory_blocks.values(), 
            key=lambda x: x.updated_at, 
            reverse=True
        )[:max_blocks]
        
        context_parts = []
        for block in recent_blocks:
            if block.type == "final_answer":
                context_parts.append(f"历史回答: {str(block.content)[:200]}...")
            elif block.type == "search_plan":
                context_parts.append(f"历史搜索计划: {block.content.get('search_strategy', '')}")
        
        return "\n".join(context_parts)

    async def _send_callback(self, event_type: str, data: Dict[str, Any]):
        """发送回调"""
        if not self.callback_url:
            return
        
        payload = {
            "event": event_type,
            "timestamp": datetime.now().isoformat(),
            "data": data
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.callback_url,
                    json=payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    if response.status != 200:
                        print(f"回调发送失败: {response.status}")
        except Exception as e:
            print(f"发送回调时出错: {e}")

    async def get_search_status(self, search_id: str, workspace_id: str) -> Dict[str, Any]:
        """获取搜索状态"""
        workspace = self.workspace_manager.get_workspace(workspace_id)
        if not workspace:
            return {"error": "工作空间不存在"}
        
        search_record = workspace.get_search_record(search_id)
        if not search_record:
            return {"error": "搜索记录不存在"}
        
        return {
            "search_id": search_id,
            "workspace_id": workspace_id,
            "status": search_record["status"],
            "query": search_record["query"],
            "started_at": search_record["started_at"],
            "completed_at": search_record.get("completed_at"),
            "results_count": search_record.get("results_count", 0),
            "workspace_summary": workspace.get_summary()
        }

    async def get_search_results(self, search_id: str, workspace_id: str) -> Dict[str, Any]:
        """获取搜索结果"""
        workspace = self.workspace_manager.get_workspace(workspace_id)
        if not workspace:
            return {"error": "工作空间不存在"}
        
        # 查找相关的内存块
        result_blocks = {}
        for block_id, block in workspace.memory_blocks.items():
            if block.metadata.get("search_id") == search_id:
                result_blocks[block.type] = block.content
        
        if not result_blocks:
            return {"error": "搜索结果不存在"}
        
        return {
            "search_id": search_id,
            "workspace_id": workspace_id,
            "results": result_blocks
        } 