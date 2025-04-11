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

# Set environment variables for API keys
os.environ["JINA_API_KEY"] = input("Enter your JINA_API_KEY: ")
os.environ["OPENROUTER_API_KEY"] = input("Enter your OPENROUTER_API_KEY: ")

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

async def rerank(text: str, query: str, top_docs: int = 5, split_fn: Optional[Callable] = None, merge_fn: Optional[Callable] = None) -> str:
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

async def main():
    task = """帮我找一下windows端的轻量级浏览器，轻量级是指占用低，内存小，加载快，还有最新的一些ai浏览器，列出一个中文表格"""
    search_tool = SearchTool()
    
    print("Searching for:", task)
    results = await search_tool.search(task)
    formatted_results = search_tool._format_results(results)
    print("Search Results:\n", formatted_results)

if __name__ == "__main__":
    asyncio.run(main())