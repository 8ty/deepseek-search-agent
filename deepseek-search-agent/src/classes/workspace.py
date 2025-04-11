import os
import asyncio
import json
import random
import re
import string
import traceback
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, TypedDict
from urllib.parse import quote_plus
import aiohttp
from jinja2 import BaseLoader, Environment
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Set your API keys here
os.environ["JINA_API_KEY"] = "your_jina_api_key"
os.environ["OPENROUTER_API_KEY"] = "your_openrouter_api_key"

# Helper functions
def extract_json_values(text: str):
    decoder = json.JSONDecoder()

    def next_json_position(pos: int):
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
    json_values = list(extract_json_values(text))
    if not json_values:
        raise ValueError("No JSON found in response")
    return max(json_values, key=lambda x: len(json.dumps(x)))

def segment_rc(text: str, chunk_size=1000, chunk_overlap=500) -> List[str]:
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        is_separator_regex=False,
    )
    return text_splitter.split_text(text)

async def rerank(text: str, query: str, top_docs: int = 5, split_fn: Optional[Callable[[str], List[str]]] = None, merge_fn: Optional[Callable[[List[str]], str]] = None) -> str:
    url = "https://api.jina.ai/v1/rerank"
    headers = {"Content-Type": "application/json"}

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

    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=data) as response:
            if response.status != 200:
                raise Exception(f"Failed to fetch {url}: {response.status}")

            data = await response.json()
            results = [result["document"]["text"] for result in data["results"]]
            merged_text = merge_fn(results)
            return merged_text

class ScrapTool:
    def __init__(self, gather_links: bool = True) -> None:
        self.gather_links = gather_links

    async def __call__(self, input: str, context: Optional[str] = None) -> str:
        result = await self.scrap_webpage(input, context)
        return result

    async def scrap_webpage(self, url: str, context: Optional[str] = None) -> str:
        url = f"https://r.jina.ai/{url}"
        headers = {"X-Retain-Images": "none", "X-With-Links-Summary": "true"}

        if api_key := os.getenv("JINA_API_KEY"):
            headers["Authorization"] = f"Bearer {api_key}"

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status != 200:
                    raise Exception(f"Failed to fetch {url}: {response.status}")
                result = await response.text()

            if context is not None:
                split_fn = lambda t: segment_rc(t)
                merge_fn = lambda t: "\n".join(t)
                reranked = await rerank(result, context, split_fn=split_fn, merge_fn=merge_fn)
                result = reranked

            return result

class SearchResult(TypedDict):
    url: str
    title: str
    description: str

class SearchTool:
    def __init__(self, timeout: int = 60 * 5) -> None:
        self.timeout = timeout

    async def __call__(self, input: str) -> str:
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

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=self.timeout) as response:
                if response.status != 200:
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

    def _format_results(self, results: List[SearchResult]) -> str:
        formatted_results = []
        for i, result in enumerate(results, 1):
            formatted_results.extend([
                f"Title: {result['title']}",
                f"URL Source: {result['url']}",
                f"Description: {result['description']}",
                "",
            ])
        return "\n".join(formatted_results).rstrip()

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
            async with session.post(self.base_url, headers=headers, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"API request failed with status {response.status}: {error_text}")
                response = await response.json()

                think_content = response["choices"][0]["message"]["reasoning"]
                content = think_content + "\n" + response["choices"][0]["message"]["content"]
                return content

model = OpenRouterModel(api_key=os.getenv("OPENROUTER_API_KEY"))

class Prompt:
    def __init__(self, template: str) -> None:
        self.template = template
        self.env = Environment(loader=BaseLoader())

    def __call__(self, **variables) -> str:
        prompt_template = self.env.from_string(self.template)
        prompt = prompt_template.render(**variables)
        return prompt.strip()

    async def run(self, prompt_variables: Dict[str, Any] = {}, generation_args: Dict[str, Any] = {}) -> str:
        prompt = self(**prompt_variables)
        try:
            result = await model(prompt)
            return result
        except Exception as e:
            raise

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

class Agent:
    tools = {"search": SearchTool(), "scrape": ScrapTool()}

    def __init__(self, task: str, prompt: Prompt, current_date: str = datetime.now().strftime("%Y-%m-%d")):
        self.task = task
        self.prompt = prompt
        self.current_date = current_date
        self.tool_records = None
        self.workspace = Workspace()
        self.round = 0

    async def run_tool(self, tool_id: str, tool_input: str, context: Optional[str] = None) -> str:
        try:
            assert tool_id in ["search", "scrape"], f"Illegal tool: {tool_id}"
            tool = self.tools[tool_id]
            result = await tool(tool_input, context)
            return result
        except Exception as e:
            print(f"Failed to run tool {e}")
            print(traceback.format_exc())
            return f"Tool execution failed: {e}"

    async def run(self, loop=True, max_rounds: Optional[int] = None) -> Dict[str, Any]:
        while True:
            try:
                await asyncio.sleep(20)
                response = await self.prompt.run({
                    "current_date": self.current_date,
                    "task": self.task,
                    "workspace": self.workspace.to_string(),
                    "tool_records": self.tool_records,
                })

                response = re.sub(r"(?:<think>)?.*?</think>", "", response, flags=re.DOTALL)
                response_json = extract_largest_json(response)
                assert response_json

                self.workspace.update_blocks(
                    response_json.get("status_update", "IN_PROGRESS"),
                    response_json.get("memory_updates"),
                    response_json.get("answer", None),
                )

                assert "tool_calls" in response_json
                tool_calls = response_json["tool_calls"]

                tasks = [self.run_tool(call["tool"], call["input"], self.task) for call in tool_calls]
                tool_outputs = await asyncio.gather(*tasks)

                tool_records = [{**call, "output": output} for call, output in zip(tool_calls, tool_outputs)]
                self.tool_records = tool_records

            except Exception as e:
                print(f"Error in agent loop: {str(e)}")
                await asyncio.sleep(10)
                continue

            self.round += 1
            if max_rounds and self.round > max_rounds:
                break

            if not loop or self.workspace.is_done():
                break

# Main execution
if __name__ == "__main__":
    task = """帮我找一下windows端的轻量级浏览器，轻量级是指占用低，内存小，加载快，还有最新的一些ai浏览器，列出一个中文表格"""
    prompt_template = """<Your prompt template here>"""  # Replace with your actual prompt template
    prompt = Prompt(prompt_template)
    agent = Agent(task=task, prompt=prompt)

    # Start the agent
    asyncio.run(agent.run(loop=False))