#!/usr/bin/env python3
"""
增强版搜索代理测试
验证所有改进功能：自我反省、迭代逻辑、网页抓取等
"""

import asyncio
import json
from api.github_runner import GitHubRunner, GitHubSearchAgent

async def test_self_reflection():
    """测试自我反省机制"""
    print("🧠 测试1: 自我反省机制")
    print("=" * 50)
    
    # 创建一个会触发自我反省的简单查询
    agent = GitHubSearchAgent(
        task="AI是什么",  # 简短查询，容易触发自我反省
        debug_mode=True,
        silent_mode=False
    )
    
    try:
        result = await agent.run(max_rounds=3)
        print(f"✅ 自我反省测试完成")
        print(f"📊 迭代次数: {result.get('total_rounds', 0)}")
        print(f"🎯 是否完成: {result.get('is_complete', False)}")
        return True
    except Exception as e:
        print(f"❌ 自我反省测试失败: {e}")
        return False

async def test_scraping_functionality():
    """测试网页抓取功能"""
    print("\n🌐 测试2: 网页抓取功能")
    print("=" * 50)
    
    agent = GitHubSearchAgent(
        task="React 18 新特性有哪些？请详细说明",
        debug_mode=True,
        silent_mode=False
    )
    
    try:
        result = await agent.run(max_rounds=4)
        
        # 检查是否有抓取操作
        scrape_calls = 0
        for iteration in result.get('iterations', []):
            tool_calls = iteration.get('tool_calls', [])
            scrape_calls += sum(1 for call in tool_calls if call.get('tool') == 'scrape')
        
        print(f"✅ 网页抓取测试完成")
        print(f"🕸️ 抓取调用次数: {scrape_calls}")
        print(f"📊 总迭代次数: {result.get('total_rounds', 0)}")
        return scrape_calls > 0
    except Exception as e:
        print(f"❌ 网页抓取测试失败: {e}")
        return False

async def test_iteration_limits():
    """测试迭代次数和策略调整"""
    print("\n🔄 测试3: 迭代策略和限制")
    print("=" * 50)
    
    agent = GitHubSearchAgent(
        task="如何使用深度学习进行图像识别？需要什么技术栈和工具？",
        debug_mode=True,
        silent_mode=False
    )
    
    try:
        result = await agent.run(max_rounds=6)
        
        iterations = result.get('iterations', [])
        print(f"✅ 迭代策略测试完成")
        print(f"📊 实际迭代次数: {len(iterations)}")
        print(f"🎯 是否完成: {result.get('is_complete', False)}")
        
        # 分析迭代质量
        total_tool_calls = sum(len(it.get('tool_calls', [])) for it in iterations)
        print(f"🛠️ 总工具调用次数: {total_tool_calls}")
        
        # 检查是否有策略调整的记忆块
        strategy_adjustments = 0
        for iteration in iterations:
            workspace_state = iteration.get('workspace_state', '')
            if '策略调整' in workspace_state or '自我反省' in workspace_state:
                strategy_adjustments += 1
        
        print(f"🤔 策略调整次数: {strategy_adjustments}")
        return len(iterations) > 2
    except Exception as e:
        print(f"❌ 迭代策略测试失败: {e}")
        return False

async def test_early_termination_prevention():
    """测试过早结束预防机制"""
    print("\n⏰ 测试4: 过早结束预防")
    print("=" * 50)
    
    agent = GitHubSearchAgent(
        task="Python",  # 非常简短的查询，容易导致过早结束
        debug_mode=True,
        silent_mode=False
    )
    
    try:
        result = await agent.run(max_rounds=5)
        
        iterations = result.get('iterations', [])
        print(f"✅ 过早结束预防测试完成")
        print(f"📊 迭代次数: {len(iterations)}")
        
        # 检查是否至少进行了多轮迭代
        prevented_early_termination = len(iterations) >= 3
        print(f"🛡️ 是否防止过早结束: {prevented_early_termination}")
        
        return prevented_early_termination
    except Exception as e:
        print(f"❌ 过早结束预防测试失败: {e}")
        return False

async def test_answer_quality_check():
    """测试答案质量检查"""
    print("\n📝 测试5: 答案质量检查")
    print("=" * 50)
    
    agent = GitHubSearchAgent(
        task="详细解释机器学习和深度学习的区别，包括应用场景、技术特点和学习资源",
        debug_mode=True,
        silent_mode=False
    )
    
    try:
        result = await agent.run(max_rounds=5)
        
        answer = result.get('answer', '')
        print(f"✅ 答案质量检查测试完成")
        print(f"📏 答案长度: {len(answer)}")
        print(f"🎯 是否完成: {result.get('is_complete', False)}")
        
        # 检查答案质量
        quality_indicators = ['机器学习', '深度学习', '区别', '应用']
        quality_score = sum(1 for indicator in quality_indicators if indicator in answer)
        print(f"📊 答案质量分数: {quality_score}/{len(quality_indicators)}")
        
        return len(answer) > 200 and quality_score >= 2
    except Exception as e:
        print(f"❌ 答案质量检查测试失败: {e}")
        return False

async def main():
    """主测试函数"""
    print("🚀 开始增强版搜索代理测试")
    print("=" * 60)
    
    tests = [
        ("自我反省机制", test_self_reflection),
        ("网页抓取功能", test_scraping_functionality), 
        ("迭代策略和限制", test_iteration_limits),
        ("过早结束预防", test_early_termination_prevention),
        ("答案质量检查", test_answer_quality_check)
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        print(f"\n🧪 开始执行: {test_name}")
        try:
            success = await test_func()
            results[test_name] = success
            status = "✅ 通过" if success else "❌ 失败"
            print(f"📊 {test_name}: {status}")
        except Exception as e:
            results[test_name] = False
            print(f"📊 {test_name}: ❌ 异常 - {e}")
        
        # 测试间隔休息
        await asyncio.sleep(2)
    
    # 输出总结
    print("\n" + "=" * 60)
    print("📋 测试总结")
    print("=" * 60)
    
    passed = sum(1 for success in results.values() if success)
    total = len(results)
    
    for test_name, success in results.items():
        status = "✅" if success else "❌"
        print(f"{status} {test_name}")
    
    print(f"\n📊 总体结果: {passed}/{total} 测试通过")
    
    if passed == total:
        print("🎉 所有测试均通过！增强功能正常工作。")
    elif passed >= total * 0.8:
        print("⚠️ 大部分测试通过，但仍有改进空间。")
    else:
        print("❌ 多个测试失败，需要进一步调试。")
    
    return passed, total

if __name__ == "__main__":
    asyncio.run(main()) 