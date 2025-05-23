import json
from typing import Iterator, Any


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