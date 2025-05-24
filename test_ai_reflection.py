"""
测试AI自我反思评估功能
"""

import asyncio
import os
from api.github_runner import GitHubSearchAgent, extract_largest_json

async def test_ai_reflection():
    """测试AI自我反思评估功能"""
    
    # 模拟环境变量
    os.environ["OPENROUTER_API_KEY"] = "test_key"
    
    # 创建代理实例
    agent = GitHubSearchAgent(
        task="什么是人工智能？",
        debug_mode=True,
        silent_mode=False
    )
    
    # 测试场景1：质量较差的答案
    poor_answer = "AI就是人工智能。"
    poor_tool_calls = [{"tool": "search", "input": "AI"}]
    poor_workspace = "只有基础搜索结果，信息不足"
    
    print("🧪 测试场景1：质量较差的答案")
    try:
        result1 = await agent.self_reflection_evaluation(
            answer=poor_answer,
            current_round=0,
            tool_calls=poor_tool_calls,
            workspace_state=poor_workspace
        )
        
        print(f"评估结果1: {result1}")
        print(f"是否继续: {result1.get('should_continue', False)}")
        print(f"继续原因: {result1.get('continue_reasons', [])}")
        print()
        
    except Exception as e:
        print(f"测试1失败: {e}")
    
    # 测试场景2：质量较好的答案
    good_answer = """
    人工智能(Artificial Intelligence, AI)是计算机科学的一个分支，它试图理解智能的实质，
    并生产出一种新的能以人类智能相似的方式做出反应的智能机器。主要应用领域包括：
    1. 机器学习和深度学习
    2. 自然语言处理
    3. 计算机视觉
    4. 机器人技术
    5. 专家系统
    AI的发展历史可以追溯到1950年代，目前正在深刻影响各个行业。
    """
    
    good_tool_calls = [
        {"tool": "search", "input": "人工智能定义"},
        {"tool": "search", "input": "AI应用领域"},
        {"tool": "scrap", "input": "https://example.com/ai-overview"}
    ]
    good_workspace = "已获取多个来源的详细信息，包括定义、应用、历史等"
    
    print("🧪 测试场景2：质量较好的答案")
    try:
        result2 = await agent.self_reflection_evaluation(
            answer=good_answer,
            current_round=2,
            tool_calls=good_tool_calls,
            workspace_state=good_workspace
        )
        
        print(f"评估结果2: {result2}")
        print(f"是否继续: {result2.get('should_continue', False)}")
        print(f"评估总结: {result2.get('evaluation_summary', '')}")
        print()
        
    except Exception as e:
        print(f"测试2失败: {e}")

def test_extract_json():
    """测试JSON提取功能"""
    
    print("🧪 测试JSON提取功能")
    
    # 测试正常JSON
    normal_json_text = '''
    这是一个评估结果：
    
    ```json
    {
        "completeness_score": 8,
        "quality_score": 7,
        "depth_score": 6,
        "strategy_score": 7,
        "overall_score": 7,
        "should_continue": false,
        "continue_reasons": [],
        "suggested_searches": [],
        "evaluation_summary": "答案质量良好，可以结束搜索"
    }
    ```
    
    评估完成。
    '''
    
    result = extract_largest_json(normal_json_text)
    print(f"提取结果: {result}")
    print(f"是否继续: {result.get('should_continue', 'NOT_FOUND')}")
    print()

if __name__ == "__main__":
    print("🚀 开始测试AI自我反思评估功能")
    
    # 测试JSON提取（同步）
    test_extract_json()
    
    # 测试AI评估（异步，需要API key才能真正调用）
    # asyncio.run(test_ai_reflection())
    
    print("✅ 测试完成") 