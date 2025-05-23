#!/usr/bin/env python3
"""
测试模块导入，确保没有冲突
"""

import sys
import os

def test_imports():
    """测试关键模块的导入"""
    print("🧪 测试模块导入...")
    
    try:
        # 测试 api 包导入
        import api
        print("✅ api 包导入成功")
        
        # 测试 api.github_runner 导入
        from api import github_runner
        print("✅ api.github_runner 导入成功")
        
        # 测试 GitHubRunner 类导入
        from api.github_runner import GitHubRunner
        print("✅ GitHubRunner 类导入成功")
        
        # 测试 config 包导入
        import config
        print("✅ config 包导入成功")
        
        # 测试创建 GitHubRunner 实例
        runner = GitHubRunner()
        print("✅ GitHubRunner 实例创建成功")
        
        print("\n🎉 所有导入测试通过！没有模块冲突。")
        return True
        
    except Exception as e:
        print(f"❌ 导入测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_imports()
    sys.exit(0 if success else 1) 