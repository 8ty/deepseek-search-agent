import os
import sys
import json
import asyncio
import aiohttp
import traceback
from datetime import datetime
from typing import Dict, List, Any, Optional

# 添加当前目录到 Python 路径，以便导入本地模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 导入必要的模块
try:
    from classes.workspace import Workspace
    from classes.tools import SearchTool, ScrapTool
    from classes.prompt import Prompt
    from utils.text_processing import extract_largest_json
except ImportError:
    # 如果相对导入失败，尝试绝对导入
    from .classes.workspace import Workspace
    from .classes.tools import SearchTool, ScrapTool
    from .classes.prompt import Prompt
    from .utils.text_processing import extract_largest_json

class GithubActionAgent:
    # 初始化搜索和抓取工具
    tools = {"search": SearchTool(), "scrape": ScrapTool()}

    def __init__(
        self,
        task: str,
        prompt: Prompt,
        callback_url: str,
        current_date: str = datetime.now().strftime("%Y-%m-%d"),
    ):
        self.task = task
        self.prompt = prompt
        self.current_date = current_date
        self.callback_url = callback_url
        self.tool_records = None
        self.workspace = Workspace()
        self.round = 0
        self.iteration_results = []  # 存储每次迭代的结果

    async def send_update(self, update_type: str, data: Dict[str, Any]):
        """
        向回调URL发送更新
        """
        payload = {
            "type": update_type,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(self.callback_url, json=payload) as response:
                    if response.status != 200:
                        print(f"Failed to send update: {await response.text()}")
                    else:
                        print(f"Update sent: {update_type}")
        except Exception as e:
            print(f"Error sending update: {str(e)}")

    async def run_tool(
        self, tool_id: str, tool_input: str, context: str | None = None
    ) -> str:
        try:
            assert tool_id in ["search", "scrape"], f"Illegal tool: {tool_id}"
            tool = self.tools[tool_id]
            result = await tool(tool_input, context)
            return result
        except Exception as e:
            print(f"Failed to run tool {e}")
            print(traceback.format_exc())
            return f"Tool execution failed: {e}"

    async def run(self, max_rounds: int = 5) -> Dict[str, Any]:
        # 发送初始状态
        await self.send_update("start", {"task": self.task})
        
        while self.round < max_rounds:
            try:
                print(f"Starting round {self.round + 1}")
                
                # 避免在GitHub Actions中使用IPython的clear_output
                response = await self.prompt.run(
                    {
                        "current_date": self.current_date,
                        "task": self.task,
                        "workspace": self.workspace.to_string(),
                        "tool_records": self.tool_records,
                    }
                )

                # 清除思考部分
                import re
                response = re.sub(
                    r"(?:<think>)?.*?</think>", "", response, flags=re.DOTALL
                )
                
                # 提取JSON响应
                response_json = extract_largest_json(response)
                
                if not response_json:
                    print("Failed to extract JSON from response")
                    break
                
                # 更新工作区
                self.workspace.update_blocks(
                    response_json.get("status_update", "IN_PROGRESS"),
                    response_json.get("memory_updates"),
                    response_json.get("answer", None),
                )
                
                # 记录迭代结果
                iteration_result = {
                    "round": self.round + 1,
                    "workspace_state": self.workspace.to_string(),
                    "tool_calls": response_json.get("tool_calls", []),
                    "response_json": response_json,
                }
                
                self.iteration_results.append(iteration_result)
                
                # 发送迭代更新
                await self.send_update("iteration", iteration_result)

                # 检查是否已完成
                if self.workspace.is_done():
                    await self.send_update("complete", {
                        "answer": response_json.get("answer", ""),
                        "iterations": self.iteration_results
                    })
                    break

                # 执行工具调用
                tool_calls = response_json.get("tool_calls", [])
                if not tool_calls:
                    print("No tool calls in response")
                    break
                
                tasks = [
                    self.run_tool(call["tool"], call["input"], self.task)
                    for call in tool_calls
                ]
                
                tool_outputs = await asyncio.gather(*tasks)
                
                # 记录工具输出
                tool_records = [
                    {**call, "output": output}
                    for call, output in zip(tool_calls, tool_outputs)
                ]
                
                # 将工具输出添加到下一轮
                self.tool_records = tool_records

            except Exception as e:
                print(f"Error in agent loop: {str(e)}")
                print(traceback.format_exc())
                await self.send_update("error", {"error": str(e), "traceback": traceback.format_exc()})
                # 不是无限重试，只记录错误
            
            # 增加轮次计数
            self.round += 1
            
            # 在GitHub Actions中不要休眠太长时间
            await asyncio.sleep(2)
        
        # 如果达到最大轮数但任务未完成
        if not self.workspace.is_done() and self.round >= max_rounds:
            await self.send_update("timeout", {
                "message": f"Reached maximum {max_rounds} rounds without completion",
                "iterations": self.iteration_results,
                "final_state": self.workspace.to_string()
            })
        
        return {
            "iterations": self.iteration_results,
            "final_state": self.workspace.to_string(),
            "is_complete": self.workspace.is_done(),
            "answer": self.workspace.state.get("answer")
        }

def load_prompt_template():
    """加载提示模板"""
    prompt_template = """
    {% macro format_tool_results(tool_records) %}
    {% for to in tool_records %}
    Source {{ loop.index }}️: {{ to.tool }}: {{ to.input }}
    Result:
    ```
    {{ to.output }}
    ```
    {% endfor %}
    {% endmacro %}

    The date: `{{ current_date }}`.
    You are an information analysis and exploration agent that builds solutions through systematic investigation.

    ## Investigation Cycle
    You operate in a continuous investigation cycle:

    1. Review current workspace (your memory blocks)
    2. Analyze new tool results (or initial task if first round)
    3. Update memory with new insights and track investigation progress
    4. Decide on next tools to call based on identified leads and information gaps
    5. Repeat until task completion

    ## Memory Structure
    Your memory persists between investigation cycles and consists of:
    - **Status**: Always the first line, indicates if the task is IN_PROGRESS or DONE
    - **Memory**: A collection of discrete information blocks, each with a unique ID

    ## Memory Block Usage
    - Each memory block has a unique ID in format <abc-123>content</abc-123>
    - Create separate blocks for distinct pieces of information:
      * Discovered URLs (both explored and pending)
      * Information gaps that need investigation
      * Actions already taken (to avoid repetition)
      * Promising leads for future exploration
      * Key facts and findings
      * Contradictions or inconsistencies found
    - Keep each block focused on a single idea or piece of information
    - Always cite sources when recording information from tool results
    - Use IDs to track and manage your knowledge (e.g., deleting outdated information)
    - Make sure to store sources (URLs) for the facts and findings you store

    ## Lead Management
    - Since you can only make 3 tool calls per round, store promising leads for later
    - Create dedicated memory blocks for URLs to scrape later
    - Maintain blocks for potential search queries to explore in future rounds
    - Prioritize leads based on relevance to the task

    ## Available Tools
    - **search**: Use for broad information gathering on new topics or concepts
      * Example: {"tool": "search", "input": "renewable energy statistics 2023"}
    - **scrape**: Use for extracting specific details from discovered URLs
      * Example: {"tool": "scrape", "input": "https://example.com/energy-report"}

    ## Tool Usage Guidelines
    - **When to use search**: For new concepts, filling knowledge gaps, or exploring new directions
    - **When to use scrape**: For URLs discovered that likely contain detailed information
    - **Maximum 3 tool calls per round**
    - **Never repeat the exact same tool call**
    - **Always record valuable information from tool results in memory blocks**

    ## Response Format
    You must respond with a valid JSON object containing:

    ```json
    {
      "status_update": "IN_PROGRESS or DONE",
      "memory_updates": [
        {"operation": "add", "content": "New insight or lead to investigate"},
        {"operation": "delete", "id": "abc-123"}
      ],
      "tool_calls": [
        {"tool": "search", "input": "specific search query"},
        {"tool": "scrape", "input": "https://discovered-url.com"}
      ],
      "answer": "Your final, comprehensive answer when status is DONE"
    }
    ```

    ## Important Rules
    - The "add" operation creates a new memory block
    	You do not need to specify an ID, it will be added automatically by the system.
    - The "delete" operation requires the specific ID of the block to remove
    - Never invent or fabricate information - only use facts from your memory or tool results
    - Never make up URLs - only use URLs discovered through tool results
    - CRITICAL: Any information not recorded in your memory blocks will be lost in the next round
      For example, if you find a potential webpage to scrap, you must store the URL and your intention
      Example: `{"operation": "add", "content": "Found relevant URL: https://... to scrape ..."}`
    - IMPORTANT: Make sure to delete memory blocks that are no longer necessary
    - Set status to "DONE" only when you have fully addressed the task
    - Only include the "answer" field when status is "DONE"

    Task:
    ```
    {{ task }}
    ```

    Current workspace:
    ```
    {{ workspace }}
    ```

    Tool Results:
    {{ format_tool_results(tool_records) if tool_records else '... no previous tool results ...'}}

    IMPORTANT: Generate a valid JSON response following the format above.

    Think carefully about:
    - what information do you need to preserve
    - which tools to call next
    - how to build your answer systematically with focused memory blocks

    Do NOT rely on your internal knowledge (may be biased), aim to discover information using the tools!
    """
    return prompt_template

async def main():
    # 从环境变量获取用户查询和回调URL
    query = os.environ.get("QUERY")
    callback_url = os.environ.get("CALLBACK_URL")
    
    if not query:
        print("No query provided")
        return
    
    if not callback_url:
        print("No callback URL provided")
        return
    
    # 获取API密钥
    jina_api_key = os.environ.get("JINA_API_KEY")
    openrouter_api_key = os.environ.get("OPENROUTER_API_KEY")
    
    if not jina_api_key or not openrouter_api_key:
        print("API keys not provided")
        return
    
    # 设置API密钥
    os.environ["JINA_API_KEY"] = jina_api_key
    os.environ["OPENROUTER_API_KEY"] = openrouter_api_key
    
    # 初始化提示模板
    prompt_template = load_prompt_template()
    prompt = Prompt(prompt_template)
    
    # 初始化代理
    agent = GithubActionAgent(task=query, prompt=prompt, callback_url=callback_url)
    
    # 运行代理
    print(f"Starting search agent with query: {query}")
    result = await agent.run()
    print("Search agent completed")
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    asyncio.run(main())