#!/usr/bin/env python3
"""
直接测试main函数 - 带超时机制
"""

import os
import sys
import asyncio
import signal
import traceback

print("=== 直接测试 main 函数 ===")

# 设置环境变量
os.environ["QUERY"] = os.getenv("QUERY", "测试查询")
os.environ["CALLBACK_URL"] = os.getenv("CALLBACK_URL", "https://test.com/webhook")

print(f"QUERY: {os.getenv('QUERY')}")
print(f"CALLBACK_URL: {os.getenv('CALLBACK_URL')}")
print(f"API Keys set: JINA={bool(os.getenv('JINA_API_KEY'))}, OPENROUTER={bool(os.getenv('OPENROUTER_API_KEY'))}")

def timeout_handler(signum, frame):
    print("❌ 超时！main函数执行超过30秒，强制退出")
    sys.exit(1)

# 设置30秒超时
signal.signal(signal.SIGALRM, timeout_handler)
signal.alarm(30)

try:
    print("正在导入main函数...")
    from api.github_runner import main
    print("✅ main函数导入成功")
    
    print("正在执行main函数...")
    asyncio.run(main())
    print("✅ main函数执行完成")
    
except Exception as e:
    print(f"❌ main函数执行失败: {e}")
    traceback.print_exc()
    sys.exit(1)
finally:
    signal.alarm(0)  # 取消超时

print("=== 测试完成 ===") 