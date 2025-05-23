import os
import asyncio
import json
import random
import re
import string
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, TypedDict
from urllib.parse import quote_plus
import aiohttp
from langchain_text_splitters import RecursiveCharacterTextSplitter
from jinja2 import BaseLoader, Environment

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

async def rerank(text: str, query: str, top_docs: int = 5, split_fn: Callable[[str], list[str]] = None, merge_fn: Callable[[List[str]], str] = None) -> str:
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
        model = OpenRouterModel(api_key=os.environ.get("OPENROUTER_API_KEY"))
        prompt = self(**prompt_variables)
        print(f"\nPrompt:\n{prompt}")
        try:
            result = await model(prompt)
            print(f"\nResult:\n{result}")
            return result
        except Exception as e:
            print(e)
            raise

class SearchResult(TypedDict):
    url: str
    title: str
    description: str

class SearchTool:
    def __init__(self, timeout: int = 60 * 5) -> None:
        self.timeout = timeout

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
                return response["choices"][0]["message"]["content"]

async def main():
    task = """帮我找一下windows端的轻量级浏览器，轻量级是指占用低，内存小，加载快，还有最新的一些ai浏览器，列出一个中文表格"""
    
    search_tool = SearchTool()
    model = OpenRouterModel(api_key=os.environ["OPENROUTER_API_KEY"])

    # Example of using the search tool
    search_results = await search_tool.search(task)
    for result in search_results:
        print(f"Title: {result['title']}, URL: {result['url']}, Description: {result['description']}")

    # Example of using the model
    response = await model(task)
    print(f"Model Response: {response}")

if __name__ == "__main__":
    asyncio.run(main())