"""
工具函数模块
包含文本处理、JSON 解析等辅助函数
"""

import json
import random
import string
from typing import Iterator, Any, List, Callable
from langchain_text_splitters import RecursiveCharacterTextSplitter


def extract_json_values(text: str) -> Iterator[Any]:
    """从文本中提取所有 JSON 值"""
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
    """提取文本中最大的 JSON 对象"""
    try:
        json_values = list(extract_json_values(text))
        if not json_values:
            raise ValueError("No JSON found in response")
        return max(json_values, key=lambda x: len(json.dumps(x)))
    except Exception as e:
        raise ValueError(f"Failed to extract JSON: {str(e)}\nText: {text}")


def segment_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 500) -> List[str]:
    """将文本分割成块"""
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        is_separator_regex=False,
    )
    return text_splitter.split_text(text)


def generate_unique_id(existing_ids: set = None, prefix: str = "", length: int = 6) -> str:
    """生成唯一 ID"""
    if existing_ids is None:
        existing_ids = set()
    
    while True:
        if prefix:
            # 生成格式：prefix-abc123
            letters = "".join(random.choices(string.ascii_lowercase, k=3))
            digits = "".join(random.choices(string.digits, k=3))
            new_id = f"{prefix}-{letters}{digits}"
        else:
            # 生成格式：abc-123
            letters = "".join(random.choices(string.ascii_lowercase, k=3))
            digits = "".join(random.choices(string.digits, k=3))
            new_id = f"{letters}-{digits}"
        
        if new_id not in existing_ids:
            return new_id


def clean_response_text(text: str) -> str:
    """清理响应文本，移除思考部分"""
    import re
    return re.sub(r"(?:<think>)?.*?</think>", "", text, flags=re.DOTALL)


def format_error(error: Exception, context: str = "") -> dict:
    """格式化错误信息"""
    return {
        "error": str(error),
        "type": type(error).__name__,
        "context": context
    } 