"""
GitHub Actions 执行器
专门用于在 GitHub Actions 环境中运行搜索代理
"""

import os
import sys
import json
import asyncio
import aiohttp
import traceback
import re
from typing import Dict, Any, Optional, List
from datetime import datetime

from config.settings import get_settings


# 工具类 - 复制自原始notebook
class SearchTool:
    def __init__(self, timeout: int = 60 * 5):
        self.timeout = timeout

    async def __call__(self, input: str, *args) -> str:
        results = await self.search(input)
        formatted_results = self._format_results(results)
        return formatted_results

    async def search(self, query: str) -> List[Dict[str, Any]]:
        from urllib.parse import quote_plus
        url = f"https://s.jina.ai/{quote_plus(query)}"
        
        headers = {
            "Accept": "application/json", 
            "X-Retain-Images": "none",
            "X-No-Cache": "true",
        }
        
        if api_key := os.getenv("JINA_API_KEY"):
            headers["Authorization"] = f"Bearer {api_key}"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, timeout=self.timeout) as response:
                    if response.status != 200:
                        print(f"Failed to fetch {url}: {response.status}")
                        raise Exception(f"Failed to fetch {url}: {response.status}")
                    
                    json_response = await response.json()
            
            results = [
                {
                    "url": result["url"],
                    "title": result["title"], 
                    "description": result["description"],
                }
                for result in json_response["data"]
            ]
            
            return results
            
        except Exception as e:
            raise e

    def _format_results(self, results: List[Dict[str, Any]]) -> str:
        formatted_results = []
        
        for i, result in enumerate(results, 1):
            formatted_results.extend([
                f"Title: {result['title']}", 
                f"URL Source: {result['url']}",
                f"Description: {result['description']}",
                "",
            ])
        
        return "\n".join(formatted_results).rstrip()


class ScrapTool:
    def __init__(self, gather_links: bool = True):
        self.gather_links = gather_links

    async def __call__(self, input: str, context: str | None) -> str:
        result = await self.scrap_webpage(input, context)
        return result

    async def scrap_webpage(self, url: str, context: str | None) -> str:
        url = f"https://r.jina.ai/{url}"
        
        headers = {"X-Retain-Images": "none", "X-With-Links-Summary": "true"}
        
        if api_key := os.getenv("JINA_API_KEY"):
            headers["Authorization"] = f"Bearer {api_key}"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers) as response:
                    if response.status != 200:
                        print(f"Failed to fetch {url}: {response.status}")
                        raise Exception(f"Failed to fetch {url}: {response.status}")
                    result = await response.text()
            
            # 简化处理，不使用rerank
            return result
            
        except Exception as e:
            raise e


# OpenRouter模型类
class OpenRouterModel:
    def __init__(self, model_name="deepseek/deepseek-r1:free", api_key=None, base_url="https://openrouter.ai/api/v1/chat/completions"):
        self.model_name = model_name
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        self.base_url = base_url

    def _get_headers(self):
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _build_payload(self, messages, reasoning_effort="low"):
        return {
            "model": self.model_name,
            "messages": messages,
            "reasoning": {"effort": reasoning_effort},
        }

    async def __call__(self, message: str, reasoning_effort="low"):
        messages = [{"role": "user", "content": message}]
        headers = self._get_headers()
        payload = self._build_payload(messages, reasoning_effort)

        async with aiohttp.ClientSession() as session:
            async with session.post(self.base_url, headers=headers, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"API request failed with status {response.status}: {error_text}")
                response_json = await response.json()
                
                think_content = response_json["choices"][0]["message"].get("reasoning", "")
                content = response_json["choices"][0]["message"]["content"]
                
                # 组合思考过程和回答
                full_content = think_content + "\n" + content if think_content else content
                return full_content


# JSON提取工具
def extract_json_values(text: str):
    decoder = json.JSONDecoder()

    def next_json_position(pos: int) -> int | None:
        matches = [p for p in (text.find(c, pos) for c in "{[") if p != -1]
        return min(matches) if matches else None

    pos = 0
    while (next_pos := next_json_position(pos)) is not None:
        try:
            result, index = decoder.raw_decode(text[next_pos:])
            yield result
            pos = next_pos + index
        except json.JSONDecodeError:
            pos = next_pos + 1


def extract_largest_json(text: str) -> dict:
    try:
        json_values = list(extract_json_values(text))
        if not json_values:
            raise ValueError("No JSON found in response")
        return max(json_values, key=lambda x: len(json.dumps(x)))
    except Exception as e:
        raise ValueError(f"Failed to extract JSON: {str(e)}\nText: {text}")


# 工作空间类
class Workspace:
    def __init__(self):
        self.state = {"status": "IN_PROGRESS", "blocks": {}, "answer": None}

    def to_string(self):
        result = f"Status: {self.state['status']}\n"
        result += "Memory: \n"

        if not self.state["blocks"]:
            result += "... no memory blocks ...\n"
        else:
            for block_id, content in self.state["blocks"].items():
                result += f"<{block_id}>{content}</{block_id}>\n"

        return result

    def _generate_unique_block_id(self):
        import random
        import string
        while True:
            letters = "".join(random.choices(string.ascii_lowercase, k=3))
            digits = "".join(random.choices(string.digits, k=3))
            new_id = f"{letters}-{digits}"

            if new_id not in self.state["blocks"]:
                return new_id

    def update_blocks(self, status: str, blocks: List[Dict], answer: Optional[str] = None):
        self.state["status"] = status

        for block_op in blocks:
            operation = block_op.get("operation")

            if operation == "add":
                new_id = self._generate_unique_block_id()
                self.state["blocks"][new_id] = block_op.get("content", "")

            elif operation == "delete":
                block_id = block_op.get("id")
                if block_id in self.state["blocks"]:
                    del self.state["blocks"][block_id]

        if answer is not None:
            self.state["answer"] = answer

    def is_done(self):
        return self.state["status"] != "IN_PROGRESS"


# 提示模板类
class Prompt:
    def __init__(self, template: str):
        self.template = template
        from jinja2 import Environment, BaseLoader
        self.env = Environment(loader=BaseLoader())

    def __call__(self, **variables) -> str:
        prompt_template = self.env.from_string(self.template)
        prompt = prompt_template.render(**variables)
        prompt = prompt.strip()
        return prompt

    async def run(self, prompt_variables: Dict[str, Any] = {}, generation_args: Dict[str, Any] = {}) -> str:
        model = OpenRouterModel()
        prompt = self(**prompt_variables)
        print(f"\n🤖 Prompt:\n{prompt[:500]}...\n")
        try:
            result = await model(prompt)
            print(f"\n📝 Result:\n{result[:500]}...\n")
            return result
        except Exception as e:
            print(f"❌ Model error: {e}")
            raise


# 搜索代理类
class GitHubSearchAgent:
    """GitHub Actions 搜索代理"""
    
    # 工具
    tools = {"search": SearchTool(), "scrape": ScrapTool()}

    def __init__(self, task: str, callback_url: str = None, current_date: str = None):
        self.task = task
        self.current_date = current_date or datetime.now().strftime("%Y-%m-%d")
        self.callback_url = callback_url
        self.tool_records = None
        self.workspace = Workspace()
        self.round = 0
        self.iteration_results = []

        # 创建提示模板
        self.prompt = Prompt(self._get_prompt_template())

    def _get_prompt_template(self) -> str:
        return """{% macro format_tool_results(tool_records) %}
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
- The "add" operation creates a new memory block. You do not need to specify an ID, it will be added automatically by the system.
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

Do NOT rely on your internal knowledge (may be biased), aim to discover information using the tools!"""

    async def send_update(self, update_type: str, data: Dict[str, Any]):
        """发送更新到回调URL"""
        if not self.callback_url:
            print(f"📤 Update [{update_type}]: {json.dumps(data, ensure_ascii=False, indent=2)}")
            return
            
        payload = {
            "type": update_type,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(self.callback_url, json=payload) as response:
                    if response.status != 200:
                        print(f"❌ Failed to send update: {await response.text()}")
                    else:
                        print(f"✅ Update sent: {update_type}")
        except Exception as e:
            print(f"❌ Error sending update: {str(e)}")

    async def run_tool(self, tool_id: str, tool_input: str, context: str | None = None) -> str:
        try:
            assert tool_id in ["search", "scrape"], f"Illegal tool: {tool_id}"
            tool = self.tools[tool_id]
            result = await tool(tool_input, context)
            return result
        except Exception as e:
            print(f"❌ Failed to run tool {e}")
            print(traceback.format_exc())
            return f"Tool execution failed: {e}"

    async def run(self, max_rounds: int = 5) -> Dict[str, Any]:
        """运行搜索代理"""
        
        # 发送初始状态
        await self.send_update("start", {"task": self.task})
        
        while self.round < max_rounds:
            try:
                print(f"\n🔄 === Round {self.round + 1} ===")
                
                response = await self.prompt.run({
                    "current_date": self.current_date,
                    "task": self.task,
                    "workspace": self.workspace.to_string(),
                    "tool_records": self.tool_records,
                })

                # 清除思考部分
                response = re.sub(r"(?:<think>)?.*?</think>", "", response, flags=re.DOTALL)
                
                # 提取JSON响应
                response_json = extract_largest_json(response)
                
                if not response_json:
                    print("❌ Failed to extract JSON from response")
                    break
                
                # 更新工作区
                self.workspace.update_blocks(
                    response_json.get("status_update", "IN_PROGRESS"),
                    response_json.get("memory_updates", []),
                    response_json.get("answer", None),
                )
                
                # 记录迭代结果
                iteration_result = {
                    "round": self.round + 1,
                    "workspace_state": self.workspace.to_string(),
                    "tool_calls": response_json.get("tool_calls", []),
                    "response_json": response_json,
                    "raw_response": response[:500] + "..." if len(response) > 500 else response
                }
                
                self.iteration_results.append(iteration_result)
                
                # 发送迭代更新
                await self.send_update("iteration", iteration_result)

                # 检查是否已完成
                if self.workspace.is_done():
                    final_answer = response_json.get("answer", "")
                    await self.send_update("complete", {
                        "answer": final_answer,
                        "iterations": self.iteration_results,
                        "total_rounds": self.round + 1
                    })
                    break

                # 执行工具调用
                tool_calls = response_json.get("tool_calls", [])
                if not tool_calls:
                    print("⚠️ No tool calls in response")
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
                print(f"❌ Error in agent loop: {str(e)}")
                print(traceback.format_exc())
                await self.send_update("error", {"error": str(e), "traceback": traceback.format_exc()})
                break
            
            # 增加轮次计数
            self.round += 1
            
            # GitHub Actions中稍微延迟避免API限制
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
            "answer": self.workspace.state.get("answer"),
            "total_rounds": self.round
        }


class GitHubRunner:
    """GitHub Actions 运行器"""
    
    def __init__(self):
        self.settings = get_settings()

    async def run_iterative_search(self, query: str, callback_url: str = None, max_rounds: int = 5) -> Dict[str, Any]:
        """运行迭代搜索"""
        try:
            print(f"🚀 开始迭代搜索: {query}")
            
            # 创建搜索代理
            agent = GitHubSearchAgent(
                task=query,
                callback_url=callback_url
            )
            
            # 运行搜索
            result = await agent.run(max_rounds=max_rounds)
            
            print(f"✅ 搜索完成: {result}")
            return result
            
        except Exception as e:
            error_result = {
                "error": f"迭代搜索失败: {str(e)}",
                "success": False
            }
            print(f"❌ 错误: {error_result}")
            return error_result

    async def run_from_env(self) -> Dict[str, Any]:
        """从环境变量运行搜索"""
        try:
            # 从环境变量获取参数
            query = os.getenv("SEARCH_QUERY")
            if not query:
                return {
                    "error": "环境变量 SEARCH_QUERY 未设置",
                    "success": False
                }
            
            callback_url = os.getenv("CALLBACK_URL")
            max_rounds = int(os.getenv("MAX_ROUNDS", "5"))
            
            print(f"🔍 从环境变量开始搜索: {query}")
            
            # 执行迭代搜索
            result = await self.run_iterative_search(query, callback_url, max_rounds)
            
            return result
            
        except Exception as e:
            error_result = {
                "error": f"环境变量执行失败: {str(e)}",
                "success": False
            }
            print(f"❌ 错误: {error_result}")
            return error_result

    def check_environment(self) -> Dict[str, Any]:
        """检查运行环境"""
        env_info = {
            "platform": sys.platform,
            "python_version": sys.version,
            "github_actions": os.getenv("GITHUB_ACTIONS") == "true",
            "github_repository": os.getenv("GITHUB_REPOSITORY"),
            "github_ref": os.getenv("GITHUB_REF"),
            "github_sha": os.getenv("GITHUB_SHA"),
            "runner_os": os.getenv("RUNNER_OS"),
            "api_keys_available": {
                "openrouter": bool(os.getenv("OPENROUTER_API_KEY")),
                "jina": bool(os.getenv("JINA_API_KEY"))
            }
        }
        
        print("🔧 运行环境信息:")
        for key, value in env_info.items():
            print(f"  {key}: {value}")
        
        return env_info

    def validate_environment(self) -> tuple[bool, list[str]]:
        """验证环境是否满足运行要求"""
        errors = []
        
        # 检查必需的 API 密钥
        if not os.getenv("OPENROUTER_API_KEY"):
            errors.append("缺少 OPENROUTER_API_KEY 环境变量")
        
        if not os.getenv("JINA_API_KEY"):
            errors.append("缺少 JINA_API_KEY 环境变量")
        
        # 检查 Python 版本
        if sys.version_info < (3, 8):
            errors.append(f"Python 版本过低: {sys.version}，需要 3.8+")
        
        return len(errors) == 0, errors


# CLI 入口函数
async def main():
    """主函数 - CLI 入口"""
    runner = GitHubRunner()
    
    # 检查和验证环境
    print("🚀 DeepSeek 搜索代理 - GitHub Runner")
    print("=" * 50)
    
    runner.check_environment()
    
    is_valid, errors = runner.validate_environment()
    if not is_valid:
        print("❌ 环境验证失败:")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)
    
    print("✅ 环境验证通过")
    
    # 确定运行模式
    search_query = os.getenv("SEARCH_QUERY")
    
    if search_query:
        # 环境变量模式
        print("🔧 使用环境变量模式")
        result = await runner.run_from_env()
    else:
        # 命令行参数模式
        if len(sys.argv) < 2:
            print("❌ 缺少搜索查询参数")
            print("用法: python -m api.github_runner \"搜索查询\"")
            print("或设置环境变量: SEARCH_QUERY")
            sys.exit(1)
        
        query = " ".join(sys.argv[1:])
        print(f"💻 使用命令行模式: {query}")
        result = await runner.run_iterative_search(query)
    
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


if __name__ == "__main__":
    asyncio.run(main()) 