import os
import asyncio
import json
import random
import re
import string
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import quote_plus
import aiohttp
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
            return merge_fn(results)

class ScrapTool:
    def __init__(self, gather_links: bool = True) -> None:
        self.gather_links = gather_links

    async def __call__(self, input: str, context: str | None) -> str:
        return await self.scrap_webpage(input, context)

    async def scrap_webpage(self, url: str, context: str | None) -> str:
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
                    return reranked

                return result

class SearchTool:
    async def __call__(self, input: str) -> str:
        results = await self.search(input)
        return self._format_results(results)

    async def search(self, query: str) -> List[Dict[str, str]]:
        url = f"https://s.jina.ai/{quote_plus(query)}"
        headers = {
            "Accept": "application/json",
            "X-Retain-Images": "none",
            "X-No-Cache": "true",
        }
        if api_key := os.getenv("JINA_API_KEY"):
            headers["Authorization"] = f"Bearer {api_key}"

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status != 200:
                    raise Exception(f"Failed to fetch {url}: {response.status}")

                json_response = await response.json()
                return json_response["data"]

    def _format_results(self, results: List[Dict[str, str]]) -> str:
        formatted_results = []
        for result in results:
            formatted_results.append(f"Title: {result['title']}\nURL Source: {result['url']}\nDescription: {result['description']}\n")
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
                return response["choices"][0]["message"]["content"]

async def main():
    task = "帮我找一下windows端的轻量级浏览器，轻量级是指占用低，内存小，加载快，还有最新的一些ai浏览器，列出一个中文表格"
    
    # Initialize tools
    search_tool = SearchTool()
    scrap_tool = ScrapTool()
    model = OpenRouterModel(api_key=os.environ["OPENROUTER_API_KEY"])

    # Example usage
    search_results = await search_tool(task)
    print("Search Results:\n", search_results)

    # You can add more logic here to use scrap_tool and model as needed

if __name__ == "__main__":
    asyncio.run(main())