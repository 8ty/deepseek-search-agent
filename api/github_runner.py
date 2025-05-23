"""
GitHub Actions 执行器
专门用于在 GitHub Actions 环境中运行搜索代理
"""

import os
import sys
import json
import asyncio
from typing import Dict, Any, Optional

from .search_api import SearchAPI
from config.settings import get_settings


class GitHubRunner:
    """GitHub Actions 运行器"""
    
    def __init__(self):
        self.settings = get_settings()
        self.api = SearchAPI()

    async def run_from_webhook(self, webhook_data: Dict[str, Any]) -> Dict[str, Any]:
        """从 Webhook 数据运行搜索"""
        try:
            # 解析 Webhook 数据
            query = webhook_data.get("query")
            if not query:
                return {
                    "error": "Webhook 数据中缺少查询参数",
                    "success": False
                }
            
            # 获取其他参数
            callback_url = webhook_data.get("callback_url")
            workspace_id = webhook_data.get("workspace_id")
            max_results = webhook_data.get("max_results", 10)
            include_scraping = webhook_data.get("include_scraping", True)
            
            print(f"🔍 开始搜索: {query}")
            print(f"📞 回调 URL: {callback_url}")
            
            # 准备搜索请求
            search_request = {
                "query": query,
                "workspace_id": workspace_id,
                "max_results": max_results,
                "include_scraping": include_scraping,
                "callback_url": callback_url
            }
            
            # 执行搜索
            result = await self.api.trigger_search(search_request)
            
            print(f"✅ 搜索结果: {result}")
            return result
            
        except Exception as e:
            error_result = {
                "error": f"GitHub Runner 执行失败: {str(e)}",
                "success": False
            }
            print(f"❌ 错误: {error_result}")
            return error_result

    async def run_from_env(self) -> Dict[str, Any]:
        """从环境变量运行搜索"""
        try:
            # 从环境变量获取参数
            query = os.getenv("SEARCH_QUERY")
            if not query:
                return {
                    "error": "环境变量 SEARCH_QUERY 未设置",
                    "success": False
                }
            
            callback_url = os.getenv("CALLBACK_URL")
            workspace_id = os.getenv("WORKSPACE_ID")
            max_results = int(os.getenv("MAX_RESULTS", "10"))
            include_scraping = os.getenv("INCLUDE_SCRAPING", "true").lower() == "true"
            
            print(f"🔍 从环境变量开始搜索: {query}")
            
            # 准备搜索请求
            search_request = {
                "query": query,
                "workspace_id": workspace_id,
                "max_results": max_results,
                "include_scraping": include_scraping,
                "callback_url": callback_url
            }
            
            # 执行搜索
            result = await self.api.trigger_search(search_request)
            
            print(f"✅ 搜索结果: {result}")
            return result
            
        except Exception as e:
            error_result = {
                "error": f"环境变量执行失败: {str(e)}",
                "success": False
            }
            print(f"❌ 错误: {error_result}")
            return error_result

    async def run_direct_search(self, query: str, **kwargs) -> Dict[str, Any]:
        """直接执行搜索"""
        try:
            print(f"🔍 直接搜索: {query}")
            
            # 准备搜索请求
            search_request = {
                "query": query,
                **kwargs
            }
            
            # 执行搜索
            result = await self.api.trigger_search(search_request)
            
            print(f"✅ 搜索结果: {result}")
            return result
            
        except Exception as e:
            error_result = {
                "error": f"直接搜索失败: {str(e)}",
                "success": False
            }
            print(f"❌ 错误: {error_result}")
            return error_result

    def check_environment(self) -> Dict[str, Any]:
        """检查运行环境"""
        env_info = {
            "platform": sys.platform,
            "python_version": sys.version,
            "github_actions": os.getenv("GITHUB_ACTIONS") == "true",
            "github_repository": os.getenv("GITHUB_REPOSITORY"),
            "github_ref": os.getenv("GITHUB_REF"),
            "github_sha": os.getenv("GITHUB_SHA"),
            "runner_os": os.getenv("RUNNER_OS"),
            "api_keys_available": {
                "openrouter": bool(os.getenv("OPENROUTER_API_KEY")),
                "jina": bool(os.getenv("JINA_API_KEY"))
            }
        }
        
        print("🔧 运行环境信息:")
        for key, value in env_info.items():
            print(f"  {key}: {value}")
        
        return env_info

    def validate_environment(self) -> tuple[bool, list[str]]:
        """验证环境是否满足运行要求"""
        errors = []
        
        # 检查必需的 API 密钥
        if not os.getenv("OPENROUTER_API_KEY"):
            errors.append("缺少 OPENROUTER_API_KEY 环境变量")
        
        if not os.getenv("JINA_API_KEY"):
            errors.append("缺少 JINA_API_KEY 环境变量")
        
        # 检查 Python 版本
        if sys.version_info < (3, 8):
            errors.append(f"Python 版本过低: {sys.version}，需要 3.8+")
        
        return len(errors) == 0, errors


# CLI 入口函数
async def main():
    """主函数 - CLI 入口"""
    runner = GitHubRunner()
    
    # 检查和验证环境
    print("🚀 DeepSeek 搜索代理 - GitHub Runner")
    print("=" * 50)
    
    runner.check_environment()
    
    is_valid, errors = runner.validate_environment()
    if not is_valid:
        print("❌ 环境验证失败:")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)
    
    print("✅ 环境验证通过")
    
    # 确定运行模式
    webhook_data_str = os.getenv("WEBHOOK_DATA")
    search_query = os.getenv("SEARCH_QUERY")
    
    if webhook_data_str:
        # Webhook 模式
        print("📡 使用 Webhook 模式")
        try:
            webhook_data = json.loads(webhook_data_str)
            result = await runner.run_from_webhook(webhook_data)
        except json.JSONDecodeError as e:
            print(f"❌ Webhook 数据 JSON 解析失败: {e}")
            sys.exit(1)
    elif search_query:
        # 环境变量模式
        print("🔧 使用环境变量模式")
        result = await runner.run_from_env()
    else:
        # 命令行参数模式
        if len(sys.argv) < 2:
            print("❌ 缺少搜索查询参数")
            print("用法: python -m api.github_runner \"搜索查询\"")
            print("或设置环境变量: SEARCH_QUERY, WEBHOOK_DATA")
            sys.exit(1)
        
        query = " ".join(sys.argv[1:])
        print(f"💻 使用命令行模式: {query}")
        result = await runner.run_direct_search(query)
    
    # 输出结果
    print("\n" + "=" * 50)
    print("📋 执行结果:")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    
    # 设置退出码
    if result.get("success", True) and not result.get("error"):
        print("✅ 执行成功")
        sys.exit(0)
    else:
        print("❌ 执行失败")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main()) 