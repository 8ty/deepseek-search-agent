"""
AI 模型接口模块
包含 OpenRouter 模型和其他 AI 模型的接口
"""

import os
import aiohttp
from typing import Dict, Any, Optional
from abc import ABC, abstractmethod


class BaseModel(ABC):
    """AI 模型基类"""
    
    @abstractmethod
    async def generate(self, message: str, **kwargs) -> str:
        """生成响应"""
        pass


class OpenRouterModel(BaseModel):
    """OpenRouter AI 模型接口"""
    
    def __init__(
        self, 
        model_name: str = "deepseek/deepseek-r1:free", 
        api_key: Optional[str] = None, 
        base_url: str = "https://openrouter.ai/api/v1/chat/completions"
    ):
        self.model_name = model_name
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        self.base_url = base_url
        
        if not self.api_key:
            raise ValueError("OpenRouter API key is required")

    def _get_headers(self) -> Dict[str, str]:
        """获取请求头"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _build_payload(self, messages: list, reasoning_effort: str = "low") -> Dict[str, Any]:
        """构建请求负载"""
        payload = {
            "model": self.model_name,
            "messages": messages,
        }
        
        # 只为支持推理的模型添加推理参数
        if "deepseek" in self.model_name.lower() and "r1" in self.model_name.lower():
            payload["reasoning"] = {"effort": reasoning_effort}
            
        return payload

    async def generate(self, message: str, reasoning_effort: str = "low") -> str:
        """生成响应"""
        messages = [{"role": "user", "content": message}]
        headers = self._get_headers()
        payload = self._build_payload(messages, reasoning_effort)

        async with aiohttp.ClientSession() as session:
            async with session.post(self.base_url, headers=headers, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"API request failed with status {response.status}: {error_text}")
                
                response_data = await response.json()
                
                # 处理不同类型的响应
                message_content = response_data["choices"][0]["message"]
                
                # 如果有推理内容，则包含推理过程
                if "reasoning" in message_content and message_content["reasoning"]:
                    reasoning = message_content["reasoning"]
                    content = message_content["content"]
                    return f"{reasoning}\n\n{content}"
                else:
                    return message_content["content"]

    async def __call__(self, message: str, reasoning_effort: str = "low") -> str:
        """使实例可调用"""
        return await self.generate(message, reasoning_effort)


def create_model(model_type: str = "openrouter", **kwargs) -> BaseModel:
    """工厂函数，创建指定类型的模型"""
    if model_type.lower() == "openrouter":
        return OpenRouterModel(**kwargs)
    else:
        raise ValueError(f"Unsupported model type: {model_type}")


# 全局模型实例（可选）
_default_model = None

def get_default_model() -> BaseModel:
    """获取默认模型实例"""
    global _default_model
    if _default_model is None:
        _default_model = create_model()
    return _default_model


def set_default_model(model: BaseModel):
    """设置默认模型实例"""
    global _default_model
    _default_model = model 