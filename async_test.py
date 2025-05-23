#!/usr/bin/env python3
"""
异步搜索测试 - 逐步诊断
"""

import os
import sys
import asyncio
import traceback

print("=== 异步搜索测试 ===")

# 设置环境变量
os.environ["QUERY"] = os.getenv("QUERY", "测试查询")
os.environ["CALLBACK_URL"] = os.getenv("CALLBACK_URL", "https://test.com/webhook")

async def test_async_steps():
    try:
        print("1. 导入GitHubRunner...")
        from api.github_runner import GitHubRunner
        print("✅ 导入成功")

        print("2. 创建GitHubRunner实例...")
        runner = GitHubRunner()
        print("✅ 实例创建成功")

        print("3. 测试环境验证...")
        is_valid, errors = runner.validate_environment()
        print(f"✅ 环境验证: valid={is_valid}, errors={errors}")

        print("4. 开始创建GitHubSearchAgent...")
        from api.github_runner import GitHubSearchAgent
        
        query = os.getenv("QUERY")
        callback_url = os.getenv("CALLBACK_URL")
        
        print(f"4.1 准备参数: query={query}, callback_url={callback_url}")
        
        print("4.2 创建GitHubSearchAgent实例...")
        agent = GitHubSearchAgent(
            task=query,
            callback_url=callback_url
        )
        print("✅ GitHubSearchAgent创建成功")

        print("5. 测试发送初始更新...")
        await agent.send_update("test", {"message": "测试消息"})
        print("✅ 发送更新成功")

        print("6. 测试Prompt初始化...")
        prompt_template = agent._get_prompt_template()
        print(f"✅ Prompt模板长度: {len(prompt_template)}")

        print("7. 测试Prompt渲染...")
        test_prompt = agent.prompt(
            current_date="2024-01-01",
            task="测试任务",
            workspace="测试工作空间",
            tool_records=None
        )
        print(f"✅ Prompt渲染成功，长度: {len(test_prompt)}")

        print("8. 测试OpenRouter模型创建...")
        from api.github_runner import OpenRouterModel
        model = OpenRouterModel()
        print("✅ OpenRouter模型创建成功")

        print("9. 测试简单API调用...")
        try:
            # 使用一个非常简单的测试调用
            response = await model("Hello", reasoning_effort="low")
            print(f"✅ API调用成功，响应长度: {len(response)}")
        except Exception as e:
            print(f"❌ API调用失败: {e}")

        print("10. 测试工具创建...")
        search_tool = agent.tools["search"]
        scrape_tool = agent.tools["scrape"]
        print("✅ 工具创建成功")

        return True

    except Exception as e:
        print(f"❌ 异步测试失败: {e}")
        traceback.print_exc()
        return False

def main():
    try:
        result = asyncio.run(test_async_steps())
        if result:
            print("✅ 所有异步测试通过!")
        else:
            print("❌ 异步测试失败")
    except Exception as e:
        print(f"❌ 主函数失败: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    main()

print("=== 异步测试完成 ===") 