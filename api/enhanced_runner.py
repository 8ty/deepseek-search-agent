#!/usr/bin/env python3
"""
增强版搜索运行器
支持继续搜索和基于现有信息生成最终结果
"""

import asyncio
import json
import os
import sys
import traceback
import argparse
from datetime import datetime
from typing import Dict, Any, List, Optional

from .github_runner import GitHubSearchAgent, GitHubRunner, get_settings
from .github_runner import Workspace, Prompt


class EnhancedSearchAgent(GitHubSearchAgent):
    """增强版搜索代理，支持从现有状态继续和生成最终结果"""
    
    def __init__(self, *args, **kwargs):
        # 提取增强功能参数
        self.continue_from_state = kwargs.pop('continue_from_state', None)
        self.is_continuation = kwargs.pop('is_continuation', False)
        self.iterations_data = kwargs.pop('iterations_data', None)
        self.action_type = kwargs.pop('action_type', None)
        
        super().__init__(*args, **kwargs)
        
        # 如果是继续搜索，从状态恢复
        if self.continue_from_state and self.is_continuation:
            self._restore_from_state(self.continue_from_state)
    
    def _restore_from_state(self, state_data: str):
        """从现有状态恢复工作空间"""
        try:
            # 尝试解析状态数据并恢复工作空间
            if "Status:" in state_data:
                # 提取状态
                lines = state_data.split('\n')
                for line in lines:
                    if line.startswith('Status:'):
                        status = line.replace('Status:', '').strip()
                        if status != 'IN_PROGRESS':
                            self.workspace.state['status'] = 'IN_PROGRESS'  # 重新设为进行中
                        break
                
                # 恢复记忆块
                self.workspace.state['memory_blocks'] = []
                current_block = None
                block_content = []
                
                for line in lines:
                    if line.startswith('<') and '>' in line:
                        # 保存之前的块
                        if current_block and block_content:
                            self.workspace.state['memory_blocks'].append({
                                'id': current_block,
                                'content': '\n'.join(block_content)
                            })
                        
                        # 开始新块
                        if not line.startswith('</'):
                            current_block = line.strip('<>')
                            block_content = []
                        else:
                            current_block = None
                            block_content = []
                    elif current_block:
                        block_content.append(line)
                
                # 保存最后一个块
                if current_block and block_content:
                    self.workspace.state['memory_blocks'].append({
                        'id': current_block,
                        'content': '\n'.join(block_content)
                    })
                
                if self.debug_mode and not self.silent_mode:
                    print(f"✅ 从状态恢复成功，恢复了 {len(self.workspace.state.get('memory_blocks', []))} 个记忆块")
            
        except Exception as e:
            if self.debug_mode and not self.silent_mode:
                print(f"⚠️ 状态恢复失败: {e}")
                print("将从新状态开始继续搜索")

    async def generate_final_result(self) -> Dict[str, Any]:
        """基于现有迭代数据生成最终结果"""
        try:
            if self.debug_mode and not self.silent_mode:
                print("📝 开始基于现有信息生成最终结果...")
            
            # 发送开始状态
            await self.send_update("start", {"task": f"基于现有信息生成最终结果: {self.task}"})
            
            # 构建总结提示
            iterations_summary = ""
            if self.iterations_data:
                iterations_summary = "以下是之前的搜索迭代记录:\n"
                for i, iteration in enumerate(self.iterations_data[:5], 1):  # 最多使用前5轮
                    iterations_summary += f"\n=== 第{i}轮迭代 ===\n"
                    iterations_summary += f"工作空间状态: {iteration.get('workspace_state', '')[:500]}...\n"
                    if iteration.get('tool_calls'):
                        iterations_summary += f"工具调用: {len(iteration['tool_calls'])} 次\n"
                        for tool_call in iteration['tool_calls'][:3]:  # 最多显示3个工具调用
                            iterations_summary += f"- {tool_call.get('tool', '')}: {tool_call.get('input', '')[:100]}...\n"
                            if tool_call.get('output'):
                                iterations_summary += f"  结果: {tool_call.get('output', '')[:200]}...\n"
            
            # 构建特殊的最终总结提示
            finalize_prompt = f"""你是一个专业的信息分析师。请基于以下搜索过程和收集的信息，为用户查询生成一个全面、准确的最终答案。

用户查询: {self.task}

{iterations_summary}

请你:
1. 分析以上搜索迭代中收集到的所有相关信息
2. 整合这些信息，确保答案的完整性和准确性
3. 提供一个结构清晰、内容丰富的最终答案
4. 如果信息不足，明确指出哪些方面需要更多信息

请直接给出最终答案，不需要再进行搜索。答案应该：
- 完整回答用户的问题
- 基于已收集的信息
- 结构清晰，易于理解
- 包含具体的建议或结论（如果适用）

最终答案:"""

            if self.debug_mode and not self.silent_mode:
                print("🤖 调用AI生成最终结果...")
            
            # 直接调用提示生成最终答案
            response = await self.prompt.run({
                "current_date": self.current_date,
                "task": finalize_prompt,
                "workspace": "",  # 不需要工作空间
                "tool_records": [],  # 不需要工具记录
            })
            
            # 清理响应（移除思考部分）
            import re
            final_answer = re.sub(r"(?:<think>)?.*?</think>", "", response, flags=re.DOTALL).strip()
            
            if self.debug_mode and not self.silent_mode:
                print(f"✅ 最终结果生成完成，长度: {len(final_answer)} 字符")
            
            # 发送完成状态
            result = {
                "answer": final_answer,
                "iterations": self.iterations_data or [],
                "total_rounds": len(self.iterations_data) if self.iterations_data else 0,
                "generation_method": "finalize_from_existing_data",
                "completedAt": datetime.now().isoformat()
            }
            
            await self.send_update("complete", result)
            
            return {
                "search_id": self.search_id,
                "iterations": self.iterations_data or [],
                "final_state": f"Status: DONE\n<finalized-result>\n{final_answer}\n</finalized-result>",
                "is_complete": True,
                "answer": final_answer,
                "total_rounds": len(self.iterations_data) if self.iterations_data else 0,
                "generation_method": "finalize_from_existing_data"
            }
            
        except Exception as e:
            error_msg = f"生成最终结果失败: {str(e)}"
            if self.debug_mode and not self.silent_mode:
                print(f"❌ {error_msg}")
                print(traceback.format_exc())
            
            await self.send_update("error", {
                "error": error_msg,
                "traceback": traceback.format_exc()
            })
            
            return {
                "error": error_msg,
                "success": False
            }


class EnhancedRunner(GitHubRunner):
    """增强版运行器"""
    
    async def continue_search(self, query: str, search_id: str, continue_from_state: str, 
                            callback_url: str = None, max_rounds: int = 3, 
                            debug_mode: bool = False, silent_mode: bool = False) -> Dict[str, Any]:
        """继续现有搜索"""
        try:
            if debug_mode and not silent_mode:
                print(f"🔄 继续搜索: {query}")
                print(f"🆔 搜索ID: {search_id}")
                print(f"🔄 额外轮次: {max_rounds}")
            
            # 创建增强搜索代理
            agent = EnhancedSearchAgent(
                task=query,
                callback_url=callback_url,
                search_id=search_id,
                debug_mode=debug_mode,
                silent_mode=silent_mode,
                continue_from_state=continue_from_state,
                is_continuation=True
            )
            
            if debug_mode and not silent_mode:
                print("✅ 增强搜索代理创建成功（继续模式）")
                print("🚀 开始继续搜索...")
            
            # 继续运行搜索
            result = await agent.run(max_rounds=max_rounds)
            
            if debug_mode and not silent_mode:
                print("✅ 继续搜索完成!")
                print(f"📊 结果概览: is_complete={result.get('is_complete')}, total_rounds={result.get('total_rounds')}")
            
            return result
            
        except Exception as e:
            error_result = {
                "error": f"继续搜索失败: {str(e)}",
                "success": False
            }
            if debug_mode and not silent_mode:
                print(f"❌ 继续搜索错误: {error_result}")
                traceback.print_exc()
            return error_result

    async def finalize_search(self, query: str, search_id: str, iterations_data: List[Dict], 
                            final_state: str, callback_url: str = None, 
                            debug_mode: bool = False, silent_mode: bool = False) -> Dict[str, Any]:
        """基于现有信息生成最终结果"""
        try:
            if debug_mode and not silent_mode:
                print(f"📝 生成最终结果: {query}")
                print(f"🆔 搜索ID: {search_id}")
                print(f"📊 基于 {len(iterations_data)} 轮迭代数据")
            
            # 创建增强搜索代理
            agent = EnhancedSearchAgent(
                task=query,
                callback_url=callback_url,
                search_id=search_id,
                debug_mode=debug_mode,
                silent_mode=silent_mode,
                iterations_data=iterations_data,
                action_type='finalize'
            )
            
            if debug_mode and not silent_mode:
                print("✅ 增强搜索代理创建成功（最终化模式）")
                print("🚀 开始生成最终结果...")
            
            # 生成最终结果
            result = await agent.generate_final_result()
            
            if debug_mode and not silent_mode:
                print("✅ 最终结果生成完成!")
                print(f"📊 结果概览: success={not result.get('error')}, answer_length={len(result.get('answer', ''))}")
            
            return result
            
        except Exception as e:
            error_result = {
                "error": f"生成最终结果失败: {str(e)}",
                "success": False
            }
            if debug_mode and not silent_mode:
                print(f"❌ 生成最终结果错误: {error_result}")
                traceback.print_exc()
            return error_result

    async def run_from_env_enhanced(self, mode: str = "continue") -> Dict[str, Any]:
        """从环境变量运行增强搜索"""
        try:
            # 通用参数
            query = os.getenv("SEARCH_QUERY")
            search_id = os.getenv("SEARCH_ID") 
            callback_url = os.getenv("CALLBACK_URL")
            debug_mode = os.getenv("DEBUG_MODE", "false").lower() == "true"
            silent_mode = os.getenv("SILENT_MODE", "true").lower() == "true"
            
            if not query or not search_id:
                return {
                    "error": "环境变量 SEARCH_QUERY 或 SEARCH_ID 未设置",
                    "success": False
                }
            
            if mode == "continue":
                # 继续搜索模式
                continue_from_state = os.getenv("CONTINUE_FROM_STATE", "")
                max_rounds = int(os.getenv("MAX_ROUNDS", "3"))
                
                if debug_mode:
                    print(f"🔄 从环境变量继续搜索: {query}")
                
                result = await self.continue_search(
                    query, search_id, continue_from_state, callback_url, 
                    max_rounds, debug_mode, silent_mode
                )
                
            elif mode == "finalize":
                # 生成最终结果模式
                iterations_data_str = os.getenv("ITERATIONS_DATA", "[]")
                final_state = os.getenv("FINAL_STATE", "")
                
                try:
                    iterations_data = json.loads(iterations_data_str) if iterations_data_str else []
                except json.JSONDecodeError:
                    iterations_data = []
                
                if debug_mode:
                    print(f"📝 从环境变量生成最终结果: {query}")
                
                result = await self.finalize_search(
                    query, search_id, iterations_data, final_state, 
                    callback_url, debug_mode, silent_mode
                )
                
            else:
                return {
                    "error": f"未知模式: {mode}",
                    "success": False
                }
            
            return result
            
        except Exception as e:
            error_result = {
                "error": f"环境变量执行失败: {str(e)}",
                "success": False
            }
            print(f"❌ 错误: {error_result}")
            return error_result


async def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='增强搜索运行器')
    parser.add_argument('--mode', choices=['continue', 'finalize'], 
                       default='continue', help='运行模式')
    args = parser.parse_args()
    
    print(f"🚀 增强搜索运行器启动 (模式: {args.mode})")
    print("=" * 50)
    
    runner = EnhancedRunner()
    
    try:
        # 执行增强搜索
        result = await runner.run_from_env_enhanced(mode=args.mode)
        
        # 输出结果
        print("\n" + "=" * 50)
        print("📋 执行结果:")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        
        # 设置退出码
        if result.get("is_complete", False) or (not result.get("error")):
            print("✅ 执行成功")
            sys.exit(0)
        else:
            print("❌ 执行失败")
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ 执行过程中发生错误: {str(e)}")
        print(traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main()) 