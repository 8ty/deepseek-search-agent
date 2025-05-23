#!/usr/bin/env python3
print("=== 导入测试开始 ===")

try:
    print("1. 导入标准库...")
    import os
    import sys
    import asyncio
    print("✅ 标准库导入成功")

    print("2. 导入第三方库...")
    import aiohttp
    import jinja2
    print("✅ 第三方库导入成功")

    print("3. 导入config模块...")
    from config.settings import get_settings
    print("✅ config模块导入成功")

    print("4. 测试get_settings()...")
    settings = get_settings()
    print(f"✅ get_settings()成功: {settings.app_name}")

    print("5. 开始导入api模块...")
    print("5.1 导入SearchTool...")
    from api.github_runner import SearchTool
    print("✅ SearchTool导入成功")

    print("5.2 导入ScrapTool...")
    from api.github_runner import ScrapTool
    print("✅ ScrapTool导入成功")

    print("5.3 导入OpenRouterModel...")
    from api.github_runner import OpenRouterModel
    print("✅ OpenRouterModel导入成功")

    print("5.4 导入GitHubSearchAgent...")
    from api.github_runner import GitHubSearchAgent
    print("✅ GitHubSearchAgent导入成功")

    print("5.5 导入GitHubRunner...")
    from api.github_runner import GitHubRunner
    print("✅ GitHubRunner导入成功")

    print("6. 创建实例测试...")
    runner = GitHubRunner()
    print("✅ GitHubRunner实例创建成功")

except Exception as e:
    print(f"❌ 导入测试失败: {e}")
    import traceback
    traceback.print_exc()

print("=== 导入测试完成 ===") 