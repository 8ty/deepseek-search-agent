#!/usr/bin/env python3
"""
测试main函数执行
"""

import os
import sys
import asyncio
import traceback

print("=== 测试 main 函数执行 ===")

# 设置环境变量（模拟GitHub Actions）
os.environ["QUERY"] = "测试查询"
os.environ["CALLBACK_URL"] = "https://test.com/webhook"

print("1. 环境变量设置完成")

try:
    print("2. 导入 GitHubRunner...")
    from api.github_runner import GitHubRunner
    print("✅ GitHubRunner 导入成功")

    print("3. 创建 GitHubRunner 实例...")
    runner = GitHubRunner()
    print("✅ GitHubRunner 实例创建成功")

    print("4. 测试 check_environment()...")
    env_info = runner.check_environment()
    print("✅ check_environment() 执行成功")

    print("5. 测试 validate_environment()...")
    is_valid, errors = runner.validate_environment()
    print(f"✅ validate_environment() 执行成功: valid={is_valid}, errors={errors}")

    print("6. 开始测试 main() 函数的逐步执行...")
    
    # 手动执行main函数的逻辑，逐步测试
    print("6.1 从环境变量获取参数...")
    query = os.getenv("QUERY")
    callback_url = os.getenv("CALLBACK_URL")
    max_rounds = int(os.getenv("MAX_ROUNDS", "5"))
    print(f"✅ 参数获取成功: query={query}, callback_url={callback_url}, max_rounds={max_rounds}")

    print("6.2 测试 run_iterative_search() 调用...")
    
    async def test_search():
        try:
            print("6.2.1 开始异步搜索测试...")
            # 注意：这里只测试调用，不一定要完成整个搜索
            result = await runner.run_iterative_search(query, callback_url, max_rounds=1)  # 只运行1轮
            print("✅ run_iterative_search() 调用成功")
            print(f"结果: {result}")
            return result
        except Exception as e:
            print(f"❌ run_iterative_search() 失败: {e}")
            traceback.print_exc()
            return None

    print("6.3 运行异步测试...")
    result = asyncio.run(test_search())
    
    if result:
        print("✅ 异步搜索测试成功!")
    else:
        print("❌ 异步搜索测试失败")

except Exception as e:
    print(f"❌ 测试失败: {e}")
    traceback.print_exc()
    sys.exit(1)

print("=== 测试完成 ===") 