# -*- coding: utf-8 -*-
"""
DeepSeek R1 Search Agent

A search agent using DeepSeek R1 reasoning capabilities with Jina AI's APIs.
"""

import os
import asyncio
import json
import random
import re
import string
import traceback
from datetime import datetime
from typing import (
    Any,
    Callable,
    Dict,
    Iterator,
    List,
    Optional,
    TypedDict,
)
from urllib.parse import quote_plus

import aiohttp
from jinja2 import BaseLoader, Environment
from langchain_text_splitters import RecursiveCharacterTextSplitter

# 设置环境变量，可以从 .env 文件或系统环境变量中获取
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv 是可选的依赖

# 如果没有设置环境变量，可以在这里设置默认值
# os.environ.setdefault("JINA_API_KEY", "your_jina_api_key")
# os.environ.setdefault("OPENROUTER_API_KEY", "your_openrouter_api_key")

"""# Helper classes and functions

## Processing functions
"""

def extract_json_values(text: str) -> Iterator[Any]:
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


def segment_rc(text: str, chunk_size=1000, chunk_overlap=500) -> List[str]:
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        is_separator_regex=False,
    )

    texts = text_splitter.split_text(text)
    return texts

async def rerank(
    text: str,
    query: str,
    top_docs: int = 5,
    split_fn: Callable[[str], list[str]] | None = None,
    merge_fn: Callable[[List[str]], str] | None = None,
) -> str:
    url = f"https://api.jina.ai/v1/rerank"

    headers = {
        "Content-Type": "application/json",
    }

    if api_key := os.getenv("JINA_API_KEY"):
        headers["Authorization"] = f"Bearer {api_key}"

    if not split_fn:
        split_fn = segment_rc

    if not merge_fn:
        merge_fn = lambda t: "\n".join(t)

    chunks = split_fn(text)

    data = {
        "model": "jina-reranker-v2-base-multilingual",
        "query": query,
        "top_n": top_docs,
        "documents": chunks,
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=data) as response:
                if response.status != 200:
                    print(f"Failed to fetch {url}: {response.status}")
                    raise Exception(f"Failed to fetch {url}: {response.status}")

                data = await response.json()
                results = [result["document"]["text"] for result in data["results"]]
                merged_text = merge_fn(results)
                return merged_text

    except Exception as e:
        raise e

"""## Tools
Search and Scrap tool classes using Jina APIs

"""

class ScrapTool:
    def __init__(self, gather_links: bool = True) -> None:
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

            if context is not None:
                split_fn = lambda t: segment_rc(t)
                merge_fn = lambda t: "\n".join(t)

                reranked = await rerank(
                    result, context, split_fn=split_fn, merge_fn=merge_fn
                )

                result = reranked

            return result

        except Exception as e:
            raise e

class SearchResult(TypedDict):
    url: str
    title: str
    description: str


class SearchTool:
    def __init__(self, timeout: int = 60 * 5) -> None:
        self.timeout = timeout

    async def __call__(self, input: str, *args) -> str:
        results = await self.search(input)
        formatted_results = self._format_results(results)
        return formatted_results

    async def search(self, query: str) -> List[SearchResult]:
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
                async with session.get(
                    url, headers=headers, timeout=self.timeout
                ) as response:
                    if response.status != 200:
                        print(f"Failed to fetch {url}: {response.status}")
                        raise Exception(f"Failed to fetch {url}: {response.status}")

                    json_response = await response.json()

            results = [
                SearchResult(
                    url=result["url"],
                    title=result["title"],
                    description=result["description"],
                )
                for result in json_response["data"]
            ]

            return results

        except Exception as e:
            raise e

    def _format_results(self, results: List[SearchResult]) -> str:
        formatted_results = []

        for i, result in enumerate(results, 1):
            formatted_results.extend(
                [
                    f"Title: {result['title']}",
                    f"URL Source: {result['url']}",
                    f"Description: {result['description']}",
                    "",
                ]
            )

        return "\n".join(formatted_results).rstrip()

"""## Model API utilities"""

class OpenRouterModel:
    def __init__(self, model_name="deepseek/deepseek-r1:free", api_key=None, base_url="https://openrouter.ai/api/v1/chat/completions"):
        self.model_name = model_name
        self.api_key = api_key
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
            async with session.post(
                self.base_url, headers=headers, json=payload
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(
                        f"API request failed with status {response.status}: {error_text}"
                    )
                response = await response.json()

                think_content = response["choices"][0]["message"]["reasoning"]
                content = (
                    think_content + "\n" + response["choices"][0]["message"]["content"]
                )
                return content

model = OpenRouterModel(api_key=os.environ["OPENROUTER_API_KEY"])

"""## Prompt utility class"""

class Prompt:
    def __init__(self, template: str) -> None:
        self.template = template
        self.env = Environment(loader=BaseLoader())

    def __call__(self, **variables) -> str:
        prompt_template = self.env.from_string(self.template)
        prompt = prompt_template.render(**variables)
        prompt = prompt.strip()
        return prompt

    async def run(
        self,
        prompt_variables: Dict[str, Any] = {},
        generation_args: Dict[str, Any] = {},
    ) -> str:
        global model
        prompt = self(**prompt_variables)
        print(f"\nPrompt:\n{prompt}")
        try:
            result = await model(prompt)
            print(f"\nResult:\n{result}")
            return result
        except Exception as e:
            print(e)
            raise

"""# Implementation"""

class Workspace:
    def __init__(self):
        self.state = {"status": "IN_PROGRESS", "blocks": {}, "answer": None}

    def to_string(self):
        """
        Converts the workspace state to a formatted string representation.

        Returns:
            str: A string representation of the workspace state
        """
        result = f"Status: {self.state['status']}\n"
        result += "Memory: \n"

        if not self.state["blocks"]:
            result += "... no memory blocks ...\n"
        else:
            for block_id, content in self.state["blocks"].items():
                result += f"<{block_id}>{content}</{block_id}>\n"

        return result

    def _generate_unique_block_id(self):
        """
        Generate a unique block ID in the format abc-123.

        Returns:
            str: A unique ID consisting of 3 lowercase letters, a hyphen, and 3 digits
        """
        while True:
            # Generate random ID in abc-123 format
            letters = "".join(random.choices(string.ascii_lowercase, k=3))
            digits = "".join(random.choices(string.digits, k=3))
            new_id = f"{letters}-{digits}"

            # Return ID if it's unique
            if new_id not in self.state["blocks"]:
                return new_id

    def update_blocks(
        self, status: str, blocks: List[Dict], answer: Optional[str] = None
    ):
        """
        Updates the workspace state with new status, blocks, and answer.

        Args:
            status (str): New status ("IN_PROGRESS" or "DONE")
            blocks (List[Dict]): List of block operations to apply
                Each dict should have:
                - "operation": "add" or "delete"
                - "content": content to add (for "add" operation)
                - "id": block id to delete (for "delete" operation)
            answer (Optional[str]): Final answer when status is "DONE"
        """
        # Update status
        self.state["status"] = status

        # Update blocks based on operations
        for block_op in blocks:
            operation = block_op.get("operation")

            if operation == "add":
                # Generate a unique block ID using helper function
                new_id = self._generate_unique_block_id()
                self.state["blocks"][new_id] = block_op.get("content", "")

            elif operation == "delete":
                block_id = block_op.get("id")
                if block_id in self.state["blocks"]:
                    del self.state["blocks"][block_id]

        # Update answer if provided
        if answer is not None:
            self.state["answer"] = answer

    def is_done(self):
        return self.state["status"] != "IN_PROGRESS"

class Agent:
    # Tools the agent can call
    tools = {"search": SearchTool(), "scrape": ScrapTool()}

    def __init__(
        self,
        task: str,
        prompt: Prompt,
        current_date: str = datetime.now().strftime("%Y-%m-%d"),
    ):
        self.task = task
        self.prompt = prompt
        self.current_date = current_date
        self.tool_records = None
        self.workspace = Workspace()
        self.round = 0

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

    async def run(self, loop=True, max_rounds: int | None = None) -> Dict[str, Any]:
        while True:
            try:
                # Rate limiting - 1 round per 20 seconds
                await asyncio.sleep(20)

                response = await self.prompt.run(
                    {
                        "current_date": self.current_date,
                        "task": self.task,
                        "workspace": self.workspace.to_string(),
                        "tool_records": self.tool_records,
                    }
                )

                response = re.sub(
                    r"(?:<think>)?.*?</think>", "", response, flags=re.DOTALL
                )
                response_json = extract_largest_json(response)
                assert response_json

                self.workspace.update_blocks(
                    response_json.get("status_update", "IN_PROGRESS"),
                    response_json.get("memory_updates"),
                    response_json.get("answer", None),
                )

                assert "tool_calls" in response_json

                tool_calls = response_json["tool_calls"]

                tasks = [
                    self.run_tool(call["tool"], call["input"], self.task)
                    for call in tool_calls
                ]

                tool_outputs = await asyncio.gather(*tasks)

                tool_records = [
                    {**call, "output": output}
                    for call, output in zip(tool_calls, tool_outputs)
                ]

                # Will be appended to the prompt in the next round
                self.tool_records = tool_records

            except Exception as e:
                print(f"Error in agent loop: {str(e)}")
                await asyncio.sleep(10)
                continue

            self.round += 1
            if max_rounds and self.round > max_rounds:
                break

            if not loop:
                break

            if self.workspace.is_done():
                break

prompt = Prompt("""
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
""")

"""# Test"""

task = """
Help me plan a 3 day holiday in Europe in May for under 2000 EURO.
1. I need specific flight and hotel recommendations.
2. I want the destination to be warm.
3. I want to have a beach nearby the hotel.
I live in Germany.
"""

agent = Agent(task=task, prompt=prompt)

"""### Iteration Zero

Before we run the model, we have an empty state:
"""

print(agent.workspace.to_string())

"""### Iteration One"""

# await agent.run(loop=False)

# agent.workspace.to_string()

"""### Iteration Two"""

# await agent.run(loop=False)

# agent.workspace.to_string()

"""### Iteration Three"""

# await agent.run(loop=False)

# agent.workspace.to_string()

"""### And So On..."""

# await agent.run(loop=False)

def main():
    """主函数，用于命令行入口"""
    import sys
    
    if len(sys.argv) > 1:
        task = " ".join(sys.argv[1:])
    else:
        task = """
        Help me plan a 3 day holiday in Europe in May for under 2000 EURO.
        1. I need specific flight and hotel recommendations.
        2. I want the destination to be warm.
        3. I want to have a beach nearby the hotel.
        I live in Germany.
        """
    
    agent = Agent(task=task, prompt=prompt)
    
    async def run_agent():
        print("启动 DeepSeek 搜索代理...")
        print(f"任务: {task}")
        print("-" * 50)
        
        try:
            result = await agent.run(max_rounds=10)
            print("\n" + "="*50)
            print("任务完成!")
            print("="*50)
            print(agent.workspace.to_string())
            return result
        except KeyboardInterrupt:
            print("\n用户中断了程序")
            return agent.workspace.state
        except Exception as e:
            print(f"\n错误: {e}")
            return None
    
    # 运行异步函数
    return asyncio.run(run_agent())

if __name__ == "__main__":
    main()