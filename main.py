#!/usr/bin/env python3
"""
DeepSeek 搜索代理 - 主入口文件

支持多种运行模式：
- GitHub Actions 模式
- 本地开发服务器
- 命令行工具
- API 服务器
"""

import os
import sys
import asyncio
import argparse
from typing import Optional

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.settings import get_settings, check_environment
from api.github_runner import GitHubRunner
from api.search_api import SearchAPI


async def run_github_actions():
    """运行 GitHub Actions 模式"""
    print("🚀 启动 GitHub Actions 模式")
    runner = GitHubRunner()
    await runner.main()


async def run_search(query: str, **kwargs):
    """运行单次搜索"""
    print(f"🔍 执行搜索: {query}")
    api = SearchAPI()
    
    search_request = {
        "query": query,
        **kwargs
    }
    
    result = await api.trigger_search(search_request)
    print(f"✅ 搜索结果: {result}")
    return result


def run_dev_server():
    """运行开发服务器"""
    try:
        import uvicorn
        from fastapi import FastAPI
        from fastapi.middleware.cors import CORSMiddleware
        
        settings = get_settings()
        
        app = FastAPI(
            title=settings.app_name,
            version=settings.app_version,
            description="DeepSeek 搜索代理 API 服务器"
        )
        
        # 添加 CORS 中间件
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.server.cors_origins,
            allow_credentials=True,
            allow_methods=settings.server.cors_methods,
            allow_headers=settings.server.cors_headers,
        )
        
        @app.get("/")
        async def root():
            return {
                "message": "DeepSeek 搜索代理 API",
                "version": settings.app_version,
                "environment": settings.environment
            }
        
        @app.get("/health")
        async def health():
            env_check = check_environment()
            return {
                "status": "healthy" if env_check["valid"] else "unhealthy",
                "environment": env_check
            }
        
        @app.post("/api/search")
        async def search_endpoint(request: dict):
            api = SearchAPI()
            return await api.trigger_search(request)
        
        print(f"🌐 启动开发服务器: http://{settings.server.host}:{settings.server.port}")
        uvicorn.run(
            app,
            host=settings.server.host,
            port=settings.server.port,
            log_level=settings.server.log_level.lower()
        )
        
    except ImportError:
        print("❌ 缺少 FastAPI 和 Uvicorn 依赖，请安装：pip install fastapi uvicorn")
        sys.exit(1)


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="DeepSeek 搜索代理")
    parser.add_argument("--mode", 
                       choices=["github", "search", "server", "check"], 
                       default="github",
                       help="运行模式")
    parser.add_argument("--query", help="搜索查询（search 模式）")
    parser.add_argument("--callback-url", help="回调 URL")
    parser.add_argument("--workspace-id", help="工作空间 ID")
    parser.add_argument("--max-results", type=int, default=10, help="最大结果数")
    parser.add_argument("--no-scraping", action="store_true", help="禁用网页抓取")
    
    args = parser.parse_args()
    
    # 检查环境
    if args.mode == "check":
        env_check = check_environment()
        print("🔧 环境检查结果:")
        print(f"  ✅ 有效: {env_check['valid']}")
        if env_check['errors']:
            print("  ❌ 错误:")
            for error in env_check['errors']:
                print(f"    - {error}")
        print(f"  📊 设置: {env_check['settings']}")
        sys.exit(0 if env_check['valid'] else 1)
    
    # 确定运行模式
    if args.mode == "github" or (
        os.getenv("GITHUB_ACTIONS") == "true" or 
        os.getenv("SEARCH_QUERY") or 
        os.getenv("WEBHOOK_DATA")
    ):
        # GitHub Actions 模式
        asyncio.run(run_github_actions())
    elif args.mode == "search":
        if not args.query:
            print("❌ search 模式需要 --query 参数")
            sys.exit(1)
        
        # 单次搜索模式
        kwargs = {}
        if args.callback_url:
            kwargs["callback_url"] = args.callback_url
        if args.workspace_id:
            kwargs["workspace_id"] = args.workspace_id
        if args.max_results:
            kwargs["max_results"] = args.max_results
        kwargs["include_scraping"] = not args.no_scraping
        
        asyncio.run(run_search(args.query, **kwargs))
    elif args.mode == "server":
        # 开发服务器模式
        run_dev_server()
    else:
        print("❌ 未知的运行模式")
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main() 