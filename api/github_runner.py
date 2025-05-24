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
import argparse
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
        
        # 重试配置
        max_retries = 3
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, headers=headers, timeout=self.timeout) as response:
                        if response.status == 200:
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
                        
                        elif response.status == 524:
                            # 524 是 Cloudflare 超时错误
                            error_msg = f"Jina API timeout (524) on attempt {attempt + 1}/{max_retries}"
                            print(f"⚠️ {error_msg}")
                            
                            if attempt < max_retries - 1:
                                print(f"🔄 Retrying in {retry_delay} seconds...")
                                await asyncio.sleep(retry_delay)
                                retry_delay *= 2  # 指数退避
                                continue
                            else:
                                return [{"url": "", "title": "Search Error", "description": f"Search API returned 524 timeout error after {max_retries} attempts. This typically means the search service is overloaded. Try simpler search terms."}]
                        
                        elif response.status == 429:
                            # 速率限制
                            error_msg = f"Jina API rate limit (429) on attempt {attempt + 1}/{max_retries}"
                            print(f"⚠️ {error_msg}")
                            
                            if attempt < max_retries - 1:
                                wait_time = retry_delay * 2
                                print(f"🔄 Rate limited, waiting {wait_time} seconds...")
                                await asyncio.sleep(wait_time)
                                continue
                            else:
                                return [{"url": "", "title": "Rate Limit Error", "description": f"Search API rate limit exceeded after {max_retries} attempts. Please wait and try again with different search terms."}]
                        
                        else:
                            # 其他HTTP错误
                            error_text = await response.text()
                            error_msg = f"Jina API error {response.status}: {error_text}"
                            print(f"❌ {error_msg}")
                            
                            if attempt < max_retries - 1:
                                print(f"🔄 Retrying in {retry_delay} seconds...")
                                await asyncio.sleep(retry_delay)
                                retry_delay *= 2
                                continue
                            else:
                                return [{"url": "", "title": f"API Error {response.status}", "description": f"Search API returned error {response.status}. Error details: {error_text[:200]}..."}]
                
            except asyncio.TimeoutError:
                error_msg = f"Search request timeout on attempt {attempt + 1}/{max_retries}"
                print(f"⚠️ {error_msg}")
                
                if attempt < max_retries - 1:
                    print(f"🔄 Retrying in {retry_delay} seconds...")
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2
                    continue
                else:
                    return [{"url": "", "title": "Timeout Error", "description": f"Search request timed out after {max_retries} attempts. Try simpler search terms or check your internet connection."}]
            
            except Exception as e:
                error_msg = f"Search error on attempt {attempt + 1}/{max_retries}: {str(e)}"
                print(f"❌ {error_msg}")
                
                if attempt < max_retries - 1:
                    print(f"🔄 Retrying in {retry_delay} seconds...")
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2
                    continue
                else:
                    return [{"url": "", "title": "Search Error", "description": f"Search failed after {max_retries} attempts. Error: {str(e)}. Try different search terms or check your network connection."}]
        
        # 这行代码实际不会执行到，但为了完整性
        return [{"url": "", "title": "Unknown Error", "description": "Search failed due to unknown error."}]

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
    
    def __init__(self, task: str, callback_url: str = None, current_date: str = None, search_id: str = None, debug_mode: bool = False, silent_mode: bool = False):
        self.task = task
        self.current_date = current_date or datetime.now().strftime("%Y-%m-%d")
        self.callback_url = callback_url
        self.search_id = search_id or f"search-{int(datetime.now().timestamp() * 1000)}"
        self.debug_mode = debug_mode
        self.silent_mode = silent_mode
        self.tool_records = None
        self.workspace = Workspace()
        self.round = 0
        self.iteration_results = []

        # 在初始化时创建工具实例，而不是在类定义时
        self.tools = {"search": SearchTool(), "scrape": ScrapTool()}
        
        # 添加模型实例
        self.model = OpenRouterModel()

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
  * Tool failures and alternative strategies to try
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

## Error Recovery Strategies
When tools fail or return errors:
1. **Try alternative search terms**: Break down complex queries into simpler ones
2. **Use broader search terms**: If specific searches fail, try more general topics
3. **Analyze error patterns**: Record what failed and why in memory blocks
4. **Attempt different approaches**: If direct searches fail, try related topics
5. **Continue investigating**: Tool failures don't mean the task is impossible
6. **Only give up after exhausting reasonable alternatives**

## Task Completion Guidelines
- **IMPORTANT**: Do NOT set status to "DONE" just because tools are failing
- **Persistence is key**: Try multiple search strategies before concluding
- **Record failures**: Document what you tried and what failed in memory blocks
- **Set status to "DONE" ONLY when**:
  - You have found sufficient information to answer the task comprehensively, OR
  - You have exhausted all reasonable search strategies and approaches, OR
  - The task appears to be asking for something that doesn't exist or is meaningless
- **If tools consistently fail**: Try simpler, more basic searches related to the topic
- **For unclear tasks**: Try to interpret them in different ways and search accordingly

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
- **PERSISTENCE**: Don't give up too early! Try multiple approaches and search strategies
- Only include the "answer" field when status is "DONE"

## 重要提醒
- **输出语言**: 请使用中文回答问题，提供中文的最终答案
- **信息验证**: 特别注意时间敏感信息的验证，确保信息的时效性
- **彻底探索**: 在得出最终答案前，尽可能彻底探索所有相关线索
- **来源引用**: 在最终答案中明确引用信息来源的URL
- **持续性**: 不要因为工具失败就过早放弃，尝试多种搜索策略

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
- whether you've tried enough different approaches before giving up

Do NOT rely on your internal knowledge (may be biased), aim to discover information using the tools!"""

    async def send_update(self, update_type: str, data: Dict[str, Any]):
        """发送更新到回调URL"""
        if not self.silent_mode:
            print(f"📤 发送更新: {update_type}")
        
        try:
            if self.callback_url:
                parsed_url = aiohttp.client_reqrep.URL(self.callback_url)
                # 添加搜索ID作为查询参数
                callback_with_id = str(parsed_url.with_query(id=self.search_id))
                
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        callback_with_id,
                        json={
                            "type": update_type,
                            "data": data,
                            "timestamp": datetime.now().isoformat()
                        },
                        timeout=aiohttp.ClientTimeout(total=30)
                    ) as response:
                        if not self.silent_mode:
                            print(f"✅ 更新发送成功: {response.status}")
            else:
                if not self.silent_mode:
                    print("⚠️ 无回调URL，跳过更新发送")
                    
        except Exception as e:
            if not self.silent_mode:
                print(f"❌ 发送更新失败: {str(e)}")

    async def wait_for_user_decision(self, timeout_seconds: int = 300) -> str:
        """等待用户决策：继续搜索 或 生成结果"""
        if not self.callback_url:
            if self.debug_mode and not self.silent_mode:
                print("⚠️ 无回调URL，无法等待用户决策")
            return 'timeout'
            
        # 构建用户决策API端点
        base_url = self.callback_url.replace('/api/webhook', '')
        decision_endpoint = f"{base_url}/api/user-decision/{self.search_id}"
        
        if self.debug_mode and not self.silent_mode:
            print(f"⏳ 等待用户决策，监听端点: {decision_endpoint}")
            print(f"⏰ 超时时间: {timeout_seconds}秒")
        
        # 轮询用户决策（每10秒检查一次）
        for i in range(timeout_seconds // 10):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(decision_endpoint, timeout=aiohttp.ClientTimeout(total=10)) as response:
                        if response.status == 200:
                            data = await response.json()
                            action = data.get('action')
                            if action:
                                if self.debug_mode and not self.silent_mode:
                                    print(f"✅ 收到用户决策: {action}")
                                return action
            except Exception as e:
                if self.debug_mode and not self.silent_mode:
                    print(f"🔄 轮询用户决策失败 (尝试 {i+1}): {str(e)}")
                pass
            
            if self.debug_mode and not self.silent_mode:
                remaining_time = timeout_seconds - (i + 1) * 10
                print(f"⏳ 等待用户决策中... (剩余 {remaining_time}秒)")
            
            await asyncio.sleep(10)
        
        if self.debug_mode and not self.silent_mode:
            print("⏰ 用户决策等待超时")
        return 'timeout'

    async def continue_search_in_same_env(self, additional_rounds: int = 3) -> Dict[str, Any]:
        """在同一环境中继续搜索额外轮次"""
        if self.debug_mode and not self.silent_mode:
            print(f"🔄 继续搜索额外 {additional_rounds} 轮")
        
        # 记录继续搜索前的状态
        pre_continue_round = self.round
        pre_continue_iterations = len(self.iteration_results)
        
        # 发送继续搜索状态更新
        await self.send_update("continue_start", {
            "message": f"开始继续搜索额外 {additional_rounds} 轮",
            "previous_rounds": pre_continue_round,
            "additional_rounds": additional_rounds
        })
        
        # 继续搜索逻辑（基于原有的run方法逻辑）
        max_total_rounds = pre_continue_round + additional_rounds
        consecutive_failures = 0
        total_tool_calls = sum(len(it.get("tool_calls", [])) for it in self.iteration_results)
        
        while self.round < max_total_rounds:
            try:
                if self.debug_mode and not self.silent_mode:
                    print(f"\n🔄 === 继续搜索 Round {self.round + 1} ===")
                
                # 使用增强的提示，说明这是继续搜索
                enhanced_task = f"{self.task}\n\n[继续搜索模式] 已完成 {pre_continue_round} 轮搜索，现在继续深入探索。请基于已有信息寻找更多细节或不同角度的信息。"
                
                response = await self.prompt.run({
                    "current_date": self.current_date,
                    "task": enhanced_task,
                    "workspace": self.workspace.to_string(),
                    "tool_records": self.tool_records,
                })
                
                if self.debug_mode and not self.silent_mode:
                    print(f"✅ 继续搜索API调用成功，响应长度: {len(response)}")

                # 清除思考部分并提取JSON
                response = re.sub(r"(?:<think>)?.*?</think>", "", response, flags=re.DOTALL)
                response_json = extract_largest_json(response)
                
                if not response_json:
                    if self.debug_mode and not self.silent_mode:
                        print("❌ 继续搜索: JSON提取失败")
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
                    "raw_response": response[:500] + "..." if len(response) > 500 else response,
                    "is_continuation": True
                }
                
                self.iteration_results.append(iteration_result)
                await self.send_update("iteration", iteration_result)

                # 检查是否完成
                if self.workspace.is_done():
                    if self.debug_mode and not self.silent_mode:
                        print("🎉 继续搜索任务完成!")
                    final_answer = response_json.get("answer", "")
                    await self.send_update("complete", {
                        "answer": final_answer,
                        "iterations": self.iteration_results,
                        "total_rounds": self.round + 1,
                        "continued_search": True
                    })
                    break

                # 执行工具调用
                tool_calls = response_json.get("tool_calls", [])
                if not tool_calls:
                    consecutive_failures += 1
                    if consecutive_failures >= 2:
                        break
                else:
                    consecutive_failures = 0
                
                total_tool_calls += len(tool_calls)
                
                # 执行工具调用（复用原有逻辑）
                tool_outputs = []
                for call in tool_calls:
                    try:
                        output = await self.run_tool(call["tool"], call["input"])
                        tool_outputs.append(output)
                    except Exception as e:
                        tool_outputs.append(f"Tool error: {str(e)}")
                
                self.tool_records = [
                    {**call, "output": output}
                    for call, output in zip(tool_calls, tool_outputs)
                ]

            except Exception as e:
                if self.debug_mode and not self.silent_mode:
                    print(f"❌ 继续搜索出错: {str(e)}")
                await self.send_update("error", {"error": str(e), "traceback": traceback.format_exc()})
                break
            
            self.round += 1
            await asyncio.sleep(2)  # 避免API限制
        
        # 返回继续搜索的结果
        return {
            "search_id": self.search_id,
            "iterations": self.iteration_results,
            "final_state": self.workspace.to_string(),
            "is_complete": self.workspace.is_done(),
            "answer": self.workspace.state.get("answer"),
            "total_rounds": self.round,
            "total_tool_calls": total_tool_calls,
            "continued_search": True,
            "additional_rounds_completed": self.round - pre_continue_round
        }

    async def finalize_with_current_state(self) -> Dict[str, Any]:
        """基于当前状态生成最终结果"""
        if self.debug_mode and not self.silent_mode:
            print("📝 开始基于当前状态生成最终结果...")
        
        # 发送最终化开始状态
        await self.send_update("finalize_start", {
            "message": "开始基于现有信息生成最终结果",
            "rounds_completed": self.round,
            "iterations_count": len(self.iteration_results)
        })
        
        try:
            # 构建总结提示
            iterations_summary = ""
            if self.iteration_results:
                iterations_summary = "以下是搜索过程中收集的信息:\n"
                for i, iteration in enumerate(self.iteration_results[:5], 1):  # 最多使用前5轮
                    iterations_summary += f"\n=== 第{i}轮搜索 ===\n"
                    workspace_state = iteration.get('workspace_state', '')
                    if len(workspace_state) > 500:
                        workspace_state = workspace_state[:500] + "..."
                    iterations_summary += f"工作空间状态: {workspace_state}\n"
                    
                    tool_calls = iteration.get('tool_calls', [])
                    if tool_calls:
                        iterations_summary += f"工具调用: {len(tool_calls)} 次\n"
                        for tool_call in tool_calls[:3]:  # 最多显示3个工具调用
                            tool_name = tool_call.get('tool', '')
                            tool_input = tool_call.get('input', '')[:100]
                            iterations_summary += f"- {tool_name}: {tool_input}...\n"
                            
                            # 如果有工具记录，显示输出
                            for record in self.tool_records:
                                if (record.get('tool') == tool_name and 
                                    record.get('input') == tool_call.get('input')):
                                    output = record.get('output', '')[:200]
                                    iterations_summary += f"  结果: {output}...\n"
                                    break
            
            # 构建最终化提示
            finalize_prompt = f"""你是一个专业的信息分析师。请基于以下搜索过程和收集的信息，为用户查询生成一个全面、准确的最终答案。

用户查询: {self.task}

{iterations_summary}

当前工作空间状态:
{self.workspace.to_string()}

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
            final_answer = re.sub(r"(?:<think>)?.*?</think>", "", response, flags=re.DOTALL).strip()
            
            if self.debug_mode and not self.silent_mode:
                print(f"✅ 最终结果生成完成，长度: {len(final_answer)} 字符")
            
            # 更新工作空间状态为完成
            self.workspace.update_blocks("DONE", [], final_answer)
            
            # 发送完成状态
            result = {
                "answer": final_answer,
                "iterations": self.iteration_results,
                "total_rounds": self.round,
                "generation_method": "finalize_from_existing_data",
                "completedAt": datetime.now().isoformat()
            }
            
            await self.send_update("complete", result)
            
            return {
                "search_id": self.search_id,
                "iterations": self.iteration_results,
                "final_state": self.workspace.to_string(),
                "is_complete": True,
                "answer": final_answer,
                "total_rounds": self.round,
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

    async def enhanced_search_flow(self, max_rounds: int = 5) -> Dict[str, Any]:
        """增强搜索流程：支持用户交互"""
        if self.debug_mode and not self.silent_mode:
            print("🔄 启动增强搜索流程...")
        
        # 正常执行搜索
        result = await self.run(max_rounds=max_rounds)
        
        # 检查是否需要用户交互
        if not result.get('is_complete') and result.get('total_rounds', 0) >= max_rounds:
            if self.debug_mode and not self.silent_mode:
                print("⏰ 搜索达到最大轮次，等待用户决策...")
            
            # 发送等待用户决策状态
            await self.send_update("waiting_user_decision", {
                "message": "搜索达到最大轮次，等待用户决策",
                "iterations": result.get('iterations', []),
                "final_state": result.get('final_state', ''),
                "options": ["continue", "finalize"]
            })
            
            # 等待用户选择
            user_action = await self.wait_for_user_decision()
            
            if user_action == 'continue':
                if self.debug_mode and not self.silent_mode:
                    print("👤 用户选择：继续搜索")
                # 继续搜索额外轮次
                continue_result = await self.continue_search_in_same_env(3)
                return continue_result
            elif user_action == 'finalize':
                if self.debug_mode and not self.silent_mode:
                    print("👤 用户选择：生成最终结果")
                # 基于现有信息生成最终结果
                final_result = await self.finalize_with_current_state()
                return final_result
            else:
                if self.debug_mode and not self.silent_mode:
                    print("⏰ 用户决策超时，自动生成最终结果")
                # 超时时自动生成最终结果
                timeout_result = await self.finalize_with_current_state()
                timeout_result['timeout_finalized'] = True
                return timeout_result
        
        return result

    async def run_tool(self, tool_id: str, tool_input: str, context: str | None = None) -> str:
        """执行工具调用"""
        try:
            assert tool_id in ["search", "scrape"], f"Illegal tool: {tool_id}"
            tool = self.tools[tool_id]
            result = await tool(tool_input, context)
            return result
        except Exception as e:
            if self.debug_mode and not self.silent_mode:
                print(f"❌ Failed to run tool {e}")
                print(traceback.format_exc())
            return f"Tool execution failed: {e}"

    async def run(self, max_rounds: int = 5) -> Dict[str, Any]:
        """运行搜索代理"""
        
        if self.debug_mode and not self.silent_mode:
            print("🔄 搜索代理开始运行...")
        
        # 发送初始状态
        if self.debug_mode and not self.silent_mode:
            print("📤 发送初始状态更新...")
        await self.send_update("start", {"task": self.task})
        if self.debug_mode and not self.silent_mode:
            print("✅ 初始状态更新发送完成")
        
        consecutive_failures = 0
        total_tool_calls = 0
        
        while self.round < max_rounds:
            try:
                if self.debug_mode and not self.silent_mode:
                    print(f"\n🔄 === Round {self.round + 1} ===")
                    print(f"🤖 准备调用OpenRouter API...")
                    print(f"📝 Prompt参数: task={self.task[:50]}..., workspace长度={len(self.workspace.to_string())}")
                
                response = await self.prompt.run({
                    "current_date": self.current_date,
                    "task": self.task,
                    "workspace": self.workspace.to_string(),
                    "tool_records": self.tool_records,
                })
                
                if self.debug_mode and not self.silent_mode:
                    print(f"✅ OpenRouter API调用成功，响应长度: {len(response)}")
                    print(f"📄 响应前200字符: {response[:200]}...")

                # 清除思考部分
                response = re.sub(r"(?:<think>)?.*?</think>", "", response, flags=re.DOTALL)
                
                if self.debug_mode and not self.silent_mode:
                    print("🔍 开始提取JSON响应...")
                # 提取JSON响应
                response_json = extract_largest_json(response)
                
                if not response_json:
                    if self.debug_mode and not self.silent_mode:
                        print("❌ Failed to extract JSON from response")
                        print(f"📄 完整响应: {response}")
                    break
                
                if self.debug_mode and not self.silent_mode:
                    print(f"✅ JSON提取成功: {list(response_json.keys())}")

                # 检查是否过早结束 - 使用更智能的自我反省机制
                status_update = response_json.get("status_update", "IN_PROGRESS")
                answer = response_json.get("answer", "")
                
                # 自我反省：在结束前检查答案质量 - 使用AI评估替代硬编码逻辑
                if status_update == "DONE":
                    # 使用AI进行智能自我评估
                    evaluation_result = await self.self_reflection_evaluation(
                        answer=answer,
                        current_round=self.round,
                        tool_calls=response_json.get("tool_calls", []),
                        workspace_state=self.workspace.to_string()
                    )
                    
                    need_continue = evaluation_result.get("should_continue", False)
                    reflection_reasons = evaluation_result.get("continue_reasons", [])
                    suggested_searches = evaluation_result.get("suggested_searches", [])
                    evaluation_summary = evaluation_result.get("evaluation_summary", "")
                    
                    # 如果需要继续，强制设置为IN_PROGRESS
                    if need_continue:
                        if self.debug_mode and not self.silent_mode:
                            print(f"🤔 AI自我反思：需要继续搜索")
                            print(f"   评估总结: {evaluation_summary}")
                            for reason in reflection_reasons:
                                print(f"   - {reason}")
                        
                        response_json["status_update"] = "IN_PROGRESS"
                        if "memory_updates" not in response_json:
                            response_json["memory_updates"] = []
                        
                        # 添加AI评估的反省记忆块
                        response_json["memory_updates"].append({
                            "operation": "add",
                            "content": f"AI自我评估 (第{self.round + 1}轮): {evaluation_summary}。评估建议: {'; '.join(reflection_reasons)}。"
                        })
                        
                        # 如果没有工具调用，使用AI建议的搜索
                        if not response_json.get("tool_calls"):
                            if suggested_searches:
                                # 使用AI建议的搜索策略
                                response_json["tool_calls"] = [
                                    {"tool": "search", "input": search_query}
                                    for search_query in suggested_searches[:3]  # 最多3个建议搜索
                                ]
                            else:
                                # 兜底：基于任务生成搜索查询
                                task_keywords = self.task.split()[:3]
                                response_json["tool_calls"] = [
                                    {"tool": "search", "input": f"{self.task} 详细解释"},
                                    {"tool": "search", "input": f"{' '.join(task_keywords)} 最新信息"}
                                ]
                    else:
                        if self.debug_mode and not self.silent_mode:
                            print("✅ AI自我评估：答案质量满足要求，可以结束搜索")
                            print(f"   评估总结: {evaluation_summary}")

                if self.debug_mode and not self.silent_mode:
                    print("📝 更新工作空间...")
                # 更新工作区
                self.workspace.update_blocks(
                    response_json.get("status_update", "IN_PROGRESS"),
                    response_json.get("memory_updates", []),
                    response_json.get("answer", None),
                )
                if self.debug_mode and not self.silent_mode:
                    print("✅ 工作空间更新完成")
                
                # 记录迭代结果
                iteration_result = {
                    "round": self.round + 1,
                    "workspace_state": self.workspace.to_string(),
                    "tool_calls": response_json.get("tool_calls", []),
                    "response_json": response_json,
                    "raw_response": response[:500] + "..." if len(response) > 500 else response
                }
                
                self.iteration_results.append(iteration_result)
                
                if self.debug_mode and not self.silent_mode:
                    print("📤 发送迭代更新...")
                # 发送迭代更新
                await self.send_update("iteration", iteration_result)
                if self.debug_mode and not self.silent_mode:
                    print("✅ 迭代更新发送完成")

                # 检查是否已完成（使用更新后的状态）
                if self.workspace.is_done():
                    if self.debug_mode and not self.silent_mode:
                        print("🎉 任务已完成!")
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
                    if self.debug_mode and not self.silent_mode:
                        print("⚠️ No tool calls in response")
                    consecutive_failures += 1
                    
                    # 如果连续多轮没有工具调用，且轮数还不多，强制继续
                    if consecutive_failures >= 2 and self.round < max_rounds - 1:
                        if self.debug_mode and not self.silent_mode:
                            print("🔄 Adding fallback search to continue exploration...")
                        tool_calls = [{"tool": "search", "input": f"information about {self.task}"}]
                    else:
                        break
                else:
                    consecutive_failures = 0
                
                total_tool_calls += len(tool_calls)
                
                if self.debug_mode and not self.silent_mode:
                    print(f"🛠️ 执行 {len(tool_calls)} 个工具调用...")
                    for i, call in enumerate(tool_calls):
                        print(f"  {i+1}. {call['tool']}: {call['input'][:100]}...")
                
                tasks = [
                    self.run_tool(call["tool"], call["input"], self.task)
                    for call in tool_calls
                ]
                
                if self.debug_mode and not self.silent_mode:
                    print("⚠️ 开始并发执行工具 - 这里可能会卡住...")
                tool_outputs = await asyncio.gather(*tasks)
                if self.debug_mode and not self.silent_mode:
                    print("✅ 工具执行完成!")
                
                # 检查工具输出质量
                successful_outputs = 0
                for i, output in enumerate(tool_outputs):
                    if output and not output.startswith("Tool execution failed") and not "failed" in output.lower():
                        successful_outputs += 1
                    if self.debug_mode and not self.silent_mode:
                        print(f"  工具 {i+1} 输出长度: {len(output)}")
                
                if self.debug_mode and not self.silent_mode:
                    print(f"📊 Tool success rate this round: {successful_outputs}/{len(tool_calls)}")
                
                # 记录工具输出
                tool_records = [
                    {**call, "output": output}
                    for call, output in zip(tool_calls, tool_outputs)
                ]
                
                # 将工具输出添加到下一轮
                self.tool_records = tool_records

            except Exception as e:
                if self.debug_mode and not self.silent_mode:
                    print(f"❌ Error in agent loop: {str(e)}")
                    print(traceback.format_exc())
                await self.send_update("error", {"error": str(e), "traceback": traceback.format_exc()})
                break
            
            # 增加轮次计数
            self.round += 1
            
            if self.debug_mode and not self.silent_mode:
                print(f"😴 轮次 {self.round} 完成，休息2秒...")
            # GitHub Actions中稍微延迟避免API限制
            await asyncio.sleep(2)
        
        if self.debug_mode and not self.silent_mode:
            print("🏁 搜索循环结束")
        
        # 如果达到最大轮数但任务未完成
        if not self.workspace.is_done() and self.round >= max_rounds:
            if self.debug_mode and not self.silent_mode:
                print("⏰ 达到最大轮数限制")
            # 生成总结性答案
            summary_answer = f"搜索完成 {self.round} 轮迭代，共执行 {total_tool_calls} 次工具调用。"
            
            if total_tool_calls == 0:
                summary_answer += "由于工具调用失败，无法获取外部信息来回答查询。"
            else:
                summary_answer += "基于可用信息，已尝试多种搜索策略。"
            
            await self.send_update("timeout", {
                "message": f"Reached maximum {max_rounds} rounds without completion",
                "iterations": self.iteration_results,
                "final_state": self.workspace.to_string(),
                "summary": summary_answer
            })
        
        if self.debug_mode and not self.silent_mode:
            print("📋 准备返回最终结果...")
        final_result = {
            "search_id": self.search_id,
            "iterations": self.iteration_results,
            "final_state": self.workspace.to_string(),
            "is_complete": self.workspace.is_done(),
            "answer": self.workspace.state.get("answer"),
            "total_rounds": self.round,
            "total_tool_calls": total_tool_calls
        }
        if self.debug_mode and not self.silent_mode:
            print("✅ 最终结果准备完成")
        
        return final_result

    async def self_reflection_evaluation(self, answer: str, current_round: int, tool_calls: List[Dict], workspace_state: str) -> Dict[str, Any]:
        """
        使用DeepSeek R1进行自我反思评估，判断是否需要继续搜索
        
        Returns:
            Dict containing evaluation results with 'should_continue' boolean and 'reasons' list
        """
        evaluation_prompt = f"""
请作为一个智能搜索代理，对当前的搜索结果进行自我评估。

# 评估标准

请根据以下标准对当前答案进行评估：

## 1. 答案完整性 (0-10分)
- 答案是否完整回答了用户的问题？
- 是否涵盖了问题的主要方面？
- 是否有明显的信息缺失？

## 2. 信息质量 (0-10分)  
- 信息是否准确可信？
- 是否有具体的事实和数据支撑？
- 信息来源是否可靠？

## 3. 答案深度 (0-10分)
- 答案是否有足够的细节和解释？
- 是否提供了背景和原理？
- 是否有实用性和可操作性？

## 4. 搜索策略评估 (0-10分)
- 当前搜索策略是否有效？
- 是否尝试了多样化的搜索角度？
- 是否有遗漏的重要搜索方向？

# 当前情况

**用户查询:** {self.task}

**当前轮次:** {current_round + 1}

**当前答案:**
{answer}

**当前工作空间状态:**
{workspace_state}

**本轮工具调用数量:** {len(tool_calls)}

# 评估任务

请按照以下JSON格式返回评估结果：

```json
{{
    "completeness_score": {{score}},
    "quality_score": {{score}}, 
    "depth_score": {{score}},
    "strategy_score": {{score}},
    "overall_score": {{total_score}},
    "should_continue": {{true/false}},
    "continue_reasons": [
        "具体原因1",
        "具体原因2"
    ],
    "suggested_searches": [
        "建议的搜索1",
        "建议的搜索2"
    ],
    "evaluation_summary": "简要评估总结"
}}
```

# 决策逻辑

- **总分 < 6分**: 需要继续搜索
- **总分 6-7分**: 根据具体情况判断
- **总分 > 7分**: 通常可以结束搜索
- **特殊情况**: 即使分数较高，如果发现重要信息缺失也应继续

请基于客观标准进行评估，确保答案真正满足用户需求。
"""

        try:
            if self.debug_mode and not self.silent_mode:
                print("🤔 启动AI自我反思评估...")
            
            # 调用模型进行评估
            evaluation_response = await self.model(evaluation_prompt, reasoning_effort="medium")
            
            # 提取评估结果
            evaluation_json = extract_largest_json(evaluation_response)
            
            if not evaluation_json:
                if self.debug_mode and not self.silent_mode:
                    print("⚠️ 评估JSON提取失败，使用默认逻辑")
                # 如果提取失败，使用简化的默认判断
                return {
                    "should_continue": current_round < 2 or len(answer) < 100,
                    "continue_reasons": ["模型评估失败，使用默认逻辑"],
                    "suggested_searches": [],
                    "evaluation_summary": "评估系统异常，采用保守策略"
                }
            
            # 验证必要字段
            required_fields = ["should_continue", "continue_reasons", "evaluation_summary"]
            for field in required_fields:
                if field not in evaluation_json:
                    evaluation_json[field] = "未提供" if field != "should_continue" else False
            
            if self.debug_mode and not self.silent_mode:
                overall_score = evaluation_json.get("overall_score", "未知")
                should_continue = evaluation_json.get("should_continue", False)
                print(f"🎯 AI评估结果: 总分 {overall_score}, 继续搜索: {should_continue}")
                if evaluation_json.get("continue_reasons"):
                    for reason in evaluation_json["continue_reasons"]:
                        print(f"   - {reason}")
            
            return evaluation_json
            
        except Exception as e:
            if self.debug_mode and not self.silent_mode:
                print(f"❌ 自我评估异常: {str(e)}")
            # 异常情况下的兜底逻辑
            return {
                "should_continue": current_round < 2,
                "continue_reasons": [f"评估系统异常: {str(e)}"],
                "suggested_searches": [],
                "evaluation_summary": "评估系统异常，采用保守策略"
            }


class GitHubRunner:
    """GitHub Actions 运行器"""
    
    def __init__(self):
        self.settings = get_settings()

    async def run_iterative_search(self, query: str, callback_url: str = None, max_rounds: int = 5, search_id: str = None, debug_mode: bool = False, silent_mode: bool = False) -> Dict[str, Any]:
        """运行迭代搜索"""
        try:
            if debug_mode and not silent_mode:
                print(f"🔄 开始迭代搜索: {query}")
                print(f"📞 回调URL: {callback_url}")
                print(f"🔄 最大轮数: {max_rounds}")
                print("📝 创建搜索代理中...")
            
            # 创建搜索代理
            agent = GitHubSearchAgent(
                task=query,
                callback_url=callback_url,
                search_id=search_id,
                debug_mode=debug_mode,
                silent_mode=silent_mode
            )
            
            if debug_mode and not silent_mode:
                print("✅ 搜索代理创建成功")
                print(f"🆔 搜索ID: {agent.search_id}")
                print("🎯 开始运行搜索代理...")
                print("⚠️  这里可能会卡住 - 监控中...")
            
            # 运行搜索
            result = await agent.run(max_rounds=max_rounds)
            
            if debug_mode and not silent_mode:
                print("✅ 搜索代理运行完成!")
                print(f"📊 搜索结果概览: is_complete={result.get('is_complete')}, total_rounds={result.get('total_rounds')}")
            
            return result
            
        except Exception as e:
            error_result = {
                "error": f"迭代搜索失败: {str(e)}",
                "success": False
            }
            if debug_mode and not silent_mode:
                print(f"❌ 搜索过程发生错误: {error_result}")
                traceback.print_exc()
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
            max_rounds = int(os.getenv("MAX_ROUNDS") or "5")
            debug_mode = os.getenv("DEBUG_MODE", "false").lower() == "true"
            
            if debug_mode:
                print(f"🔍 从环境变量开始搜索: {query}")
            
            # 执行迭代搜索
            search_id = os.getenv("WORKSPACE_ID", f"search-{int(datetime.now().timestamp() * 1000)}")
            result = await self.run_iterative_search(query, callback_url, max_rounds, search_id, debug_mode)
            
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
    # 解析命令行参数
    parser = argparse.ArgumentParser(description='DeepSeek 搜索代理')
    parser.add_argument('--interactive', action='store_true', 
                       help='启用用户交互模式（等待用户决策）')
    parser.add_argument('--mode', choices=['normal', 'interactive'], default='normal',
                       help='运行模式：normal（正常模式）或 interactive（交互模式）')
    args = parser.parse_args()
    
    runner = GitHubRunner()
    
    # 检查和验证环境
    print("🚀 启动 DeepSeek 搜索代理")
    
    # 从 GitHub Actions 环境变量获取参数
    query = os.getenv("SEARCH_QUERY")
    callback_url = os.getenv("CALLBACK_URL")
    max_rounds = int(os.getenv("MAX_ROUNDS") or "5")
    include_scraping = os.getenv("INCLUDE_SCRAPING", "true").lower() == "true"
    workspace_id = os.getenv("WORKSPACE_ID", f"ws-{int(datetime.now().timestamp() * 1000)}")
    environment = os.getenv("ENVIRONMENT", "production")
    debug_mode = os.getenv("DEBUG_MODE", "false").lower() == "true"
    silent_mode = os.getenv("SILENT_MODE", "false").lower() == "true"
    
    # 检查是否启用用户交互
    enable_user_interaction = (args.interactive or 
                             args.mode == 'interactive' or 
                             os.getenv("ENABLE_USER_INTERACTION", "false").lower() == "true")

    if debug_mode and not silent_mode:
        print(f"📋 搜索查询: {query}")
        print(f"📞 回调 URL: {callback_url}")
        print(f"🏠 工作空间: {workspace_id}")
        print(f"🔄 最大轮数: {max_rounds}")
        print(f"🔧 包含抓取: {include_scraping}")
        print(f"🌍 环境: {environment}")
        print(f"🐛 调试模式: {debug_mode}")
        print(f"🔇 静默模式: {silent_mode}")
        print(f"🤝 用户交互模式: {enable_user_interaction}")
        
        runner.check_environment()
    elif not silent_mode:
        print("🔍 搜索任务进行中...")
    
    is_valid, errors = runner.validate_environment()
    if not is_valid:
        if not silent_mode:
            print("❌ 环境验证失败:")
            for error in errors:
                print(f"  - {error}")
        sys.exit(1)
    
    if not silent_mode:
        print("✅ 环境验证通过")
    
    if not query:
        if not silent_mode:
            print("❌ 缺少搜索查询参数 (SEARCH_QUERY)")
        sys.exit(1)
    
    try:
        if enable_user_interaction:
            # 启用用户交互模式
            if debug_mode and not silent_mode:
                print("🤝 启用用户交互模式")
            
            # 创建增强搜索代理
            agent = GitHubSearchAgent(
                task=query,
                callback_url=callback_url,
                search_id=workspace_id,
                debug_mode=debug_mode,
                silent_mode=silent_mode
            )
            
            # 运行增强搜索流程
            result = await agent.enhanced_search_flow(max_rounds=max_rounds)
        else:
            # 正常模式
            result = await runner.run_iterative_search(query, callback_url, max_rounds, workspace_id, debug_mode, silent_mode)
        
        # 输出结果
        if not silent_mode:
            print("\n" + "=" * 50)
            print("📋 执行结果:")
            print(json.dumps(result, ensure_ascii=False, indent=2))
        
        # 设置退出码
        if result.get("is_complete", False) or (not result.get("error")):
            if not silent_mode:
                print("✅ 执行成功")
            sys.exit(0)
        else:
            if not silent_mode:
                print("❌ 执行失败")
            sys.exit(1)
            
    except Exception as e:
        if not silent_mode:
            print(f"❌ 执行过程中发生错误: {str(e)}")
            print(traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main()) 