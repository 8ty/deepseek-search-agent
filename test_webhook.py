#!/usr/bin/env python3
"""
测试Webhook端点 - 模拟GitHub Action发送数据
用于验证webhook修复是否有效
"""

import asyncio
import aiohttp
import json
import time
from typing import Dict, Any

class WebhookTester:
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url
        self.search_id = f"test-{int(time.time())}"
    
    async def send_update(self, update_type: str, data: Dict[str, Any]):
        """发送更新到webhook"""
        # 构建带有search_id的回调URL（模拟GitHub Action的行为）
        separator = '&' if '?' in self.webhook_url else '?'
        callback_url_with_id = f"{self.webhook_url}{separator}id={self.search_id}"
        
        payload = {
            "type": update_type,
            "data": data,
            "timestamp": "2024-01-15T10:30:00Z"
        }
        
        print(f"📤 发送 {update_type} 更新到: {callback_url_with_id}")
        print(f"📋 数据: {json.dumps(payload, ensure_ascii=False, indent=2)}")
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(callback_url_with_id, json=payload) as response:
                    response_text = await response.text()
                    if response.status == 200:
                        print(f"✅ {update_type} 更新发送成功")
                        print(f"🔄 响应: {response_text}")
                    else:
                        print(f"❌ {update_type} 更新失败: {response.status}")
                        print(f"💬 错误响应: {response_text}")
                    print("─" * 50)
                    return response.status == 200
        except Exception as e:
            print(f"❌ 发送 {update_type} 更新时出错: {str(e)}")
            print("─" * 50)
            return False
    
    async def test_complete_workflow(self):
        """测试完整的工作流程"""
        print("🚀 开始测试完整的Webhook工作流程")
        print(f"🆔 搜索ID: {self.search_id}")
        print("═" * 60)
        
        # 1. 发送开始更新
        success = await self.send_update("start", {
            "task": "如何使用 React 18 的新特性？"
        })
        if not success:
            print("❌ 开始更新失败，终止测试")
            return
        
        await asyncio.sleep(1)
        
        # 2. 发送迭代更新
        success = await self.send_update("iteration", {
            "round": 1,
            "workspace_state": "正在搜索React 18相关信息...",
            "tool_calls": [
                {
                    "tool": "search",
                    "input": "React 18 新特性",
                    "output": "找到了关于React 18的相关信息..."
                }
            ],
            "response_json": {
                "status_update": "IN_PROGRESS",
                "tool_calls": [{"tool": "search", "input": "React 18 新特性"}]
            },
            "raw_response": "搜索React 18新特性的相关信息..."
        })
        if not success:
            print("❌ 迭代更新失败，继续测试...")
        
        await asyncio.sleep(1)
        
        # 3. 发送第二轮迭代
        success = await self.send_update("iteration", {
            "round": 2,
            "workspace_state": "分析React 18特性并整理答案...",
            "tool_calls": [
                {
                    "tool": "scrape",
                    "input": "https://react.dev/blog/2022/03/29/react-v18",
                    "output": "获取了React 18官方文档内容..."
                }
            ],
            "response_json": {
                "status_update": "DONE",
                "answer": "React 18引入了自动批处理、并发特性、Suspense改进等新功能。"
            },
            "raw_response": "基于搜索结果分析React 18的新特性..."
        })
        
        await asyncio.sleep(1)
        
        # 4. 发送完成更新
        success = await self.send_update("complete", {
            "answer": "React 18 引入了多项重要的新特性：\n\n1. **自动批处理 (Automatic Batching)**：React 18 会自动批处理多个状态更新，减少不必要的重新渲染。\n\n2. **并发特性 (Concurrent Features)**：包括 Suspense、startTransition 等，提高用户体验。\n\n3. **新的 Hooks**：\n   - useId：生成唯一ID\n   - useDeferredValue：延迟值更新\n   - useTransition：标记非紧急更新\n\n4. **Suspense 改进**：支持服务器端渲染中的代码分割。\n\n5. **严格模式增强**：在开发模式下双重调用 Effects，帮助发现副作用问题。\n\n这些特性让 React 应用更加高效和用户友好。",
            "iterations": [
                {
                    "round": 1,
                    "workspace_state": "正在搜索React 18相关信息...",
                    "tool_calls": [{"tool": "search", "input": "React 18 新特性"}]
                },
                {
                    "round": 2,
                    "workspace_state": "分析React 18特性并整理答案...",
                    "tool_calls": [{"tool": "scrape", "input": "https://react.dev/blog/2022/03/29/react-v18"}]
                }
            ],
            "total_rounds": 2
        })
        
        if success:
            print("🎉 完整工作流程测试成功！")
            print(f"🔗 检查结果: 访问您的应用并查看搜索ID: {self.search_id}")
        else:
            print("❌ 完成更新失败")
        
        print("═" * 60)
        print("📋 测试总结:")
        print(f"   - 搜索ID: {self.search_id}")
        print(f"   - Webhook URL: {self.webhook_url}")
        print("   - 建议：在浏览器中访问您的应用，输入上述搜索ID查看结果")

async def main():
    """主函数"""
    print("🔧 Webhook 测试工具")
    print("═" * 60)
    
    # 提示用户输入webhook URL
    webhook_url = input("请输入您的Webhook URL (例如: https://your-app.vercel.app/api/webhook): ").strip()
    
    if not webhook_url:
        print("❌ 未提供Webhook URL，使用默认测试URL")
        webhook_url = "https://your-app.vercel.app/api/webhook"
    
    print(f"🎯 目标Webhook: {webhook_url}")
    print()
    
    # 创建测试器并运行测试
    tester = WebhookTester(webhook_url)
    await tester.test_complete_workflow()

if __name__ == "__main__":
    asyncio.run(main()) 