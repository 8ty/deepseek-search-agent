#!/usr/bin/env python3
"""
调试脚本 - 逐步测试组件初始化
"""

import os
import sys
import asyncio
import traceback
from datetime import datetime

print("=== 开始调试 ===")

print("1. 测试基础导入...")
try:
    import json
    import aiohttp
    print("✅ 基础库导入成功")
except Exception as e:
    print(f"❌ 基础库导入失败: {e}")
    sys.exit(1)

print("2. 测试 config 导入...")
try:
    from config.settings import get_settings
    print("✅ config.settings 导入成功")
except Exception as e:
    print(f"❌ config.settings 导入失败: {e}")
    traceback.print_exc()
    sys.exit(1)

print("3. 测试 get_settings() 调用...")
try:
    settings = get_settings()
    print(f"✅ settings 创建成功: {settings.app_name}")
except Exception as e:
    print(f"❌ settings 创建失败: {e}")
    traceback.print_exc()
    sys.exit(1)

print("4. 测试环境变量读取...")
query = os.getenv("QUERY")
callback_url = os.getenv("CALLBACK_URL")
print(f"✅ 环境变量读取成功:")
print(f"   QUERY: {query}")
print(f"   CALLBACK_URL: {callback_url}")

print("5. 测试工具类导入...")
try:
    print("5.1 导入 SearchTool...")
    from api.github_runner import SearchTool
    print("✅ SearchTool 导入成功")
    
    print("5.2 创建 SearchTool 实例...")
    search_tool = SearchTool()
    print("✅ SearchTool 实例创建成功")
    
    print("5.3 导入 ScrapTool...")
    from api.github_runner import ScrapTool
    print("✅ ScrapTool 导入成功")
    
    print("5.4 创建 ScrapTool 实例...")
    scrape_tool = ScrapTool()
    print("✅ ScrapTool 实例创建成功")
    
except Exception as e:
    print(f"❌ 工具类测试失败: {e}")
    traceback.print_exc()
    sys.exit(1)

print("6. 测试其他类导入...")
try:
    from api.github_runner import OpenRouterModel, Workspace, Prompt
    print("✅ 其他类导入成功")
except Exception as e:
    print(f"❌ 其他类导入失败: {e}")
    traceback.print_exc()
    sys.exit(1)

print("7. 测试 GitHubSearchAgent 导入...")
try:
    from api.github_runner import GitHubSearchAgent
    print("✅ GitHubSearchAgent 导入成功")
except Exception as e:
    print(f"❌ GitHubSearchAgent 导入失败: {e}")
    traceback.print_exc()
    sys.exit(1)

print("8. 测试 GitHubRunner 导入...")
try:
    from api.github_runner import GitHubRunner
    print("✅ GitHubRunner 导入成功")
except Exception as e:
    print(f"❌ GitHubRunner 导入失败: {e}")
    traceback.print_exc()
    sys.exit(1)

print("9. 测试 GitHubRunner 实例创建...")
try:
    runner = GitHubRunner()
    print("✅ GitHubRunner 实例创建成功")
except Exception as e:
    print(f"❌ GitHubRunner 实例创建失败: {e}")
    traceback.print_exc()
    sys.exit(1)

print("=== 调试完成 ===")
print("所有组件初始化正常！")

if __name__ == "__main__":
    print("现在开始完整测试...")
    try:
        from api.github_runner import main
        print("✅ main 函数导入成功")
        print("🚀 执行 main 函数...")
        asyncio.run(main())
    except Exception as e:
        print(f"❌ main 函数执行失败: {e}")
        traceback.print_exc()
        sys.exit(1) 