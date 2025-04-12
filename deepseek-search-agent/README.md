# DeepSeek Search Agent

基于GitHub Actions运行DeepSeek R1推理模型的搜索智能体，显示完整的搜索和思考过程。

## 项目概述

这个项目使用DeepSeek R1推理模型和Jina AI的搜索API构建了一个搜索智能体，能够：

1. **接收用户查询**：通过前端页面输入任何问题
2. **触发GitHub Actions工作流**：在云端执行搜索和推理过程
3. **展示迭代思考过程**：显示模型每一轮迭代的思考过程、记忆块和工具调用
4. **提供最终答案**：生成综合性的答案

系统架构包括：
- **前端**：Next.js应用，部署在Vercel上
- **处理逻辑**：在GitHub Actions中运行的Python脚本
- **存储**：使用Vercel KV存储搜索结果和状态

## 部署指南

### 前置条件

1. GitHub账号
2. Vercel账号
3. Jina AI API密钥 (从[jina.ai](https://jina.ai)获取)
4. OpenRouter API密钥 (从[openrouter.ai](https://openrouter.ai)获取)

### 步骤1：准备GitHub仓库

1. Fork或克隆此仓库到你的GitHub账户
2. 在GitHub仓库设置中添加以下密钥：
   - `JINA_API_KEY`：你的Jina AI API密钥
   - `OPENROUTER_API_KEY`：你的OpenRouter API密钥
   - `GITHUB_TOKEN`：具有workflow权限的个人访问令牌

### 步骤2：部署前端到Vercel

1. 在Vercel上导入你的GitHub仓库
2. 设置构建配置：
   - 框架预设：Next.js
   - 构建命令：`cd frontend && npm install && npm run build`
   - 输出目录：`frontend/.next`
3. 添加环境变量：
   - `REPOSITORY`：你的GitHub仓库名（格式：owner/repo）
   - `GITHUB_TOKEN`：与GitHub仓库中相同的个人访问令牌
4. （可选）如果使用Vercel KV存储：
   - 在Vercel控制台中创建一个KV数据库
   - 关联KV数据库到你的项目

### 步骤3：测试部署

1. 打开部署后的Vercel网站
2. 在首页输入查询问题
3. 系统会触发GitHub Actions工作流
4. 在查询结果页面查看处理状态和思考过程

## 本地开发

### 后端开发

1. 克隆仓库到本地
```bash
git clone https://github.com/yourusername/deepseek-search-agent.git
cd deepseek-search-agent
```

2. 安装Python依赖
```bash
pip install -e .
```

3. 设置环境变量
```bash
export JINA_API_KEY="your_jina_api_key"
export OPENROUTER_API_KEY="your_openrouter_api_key"
```

4. 运行后端服务
```bash
python -m src.agent
```

### 前端开发

1. 进入前端目录
```bash
cd frontend
```

2. 安装依赖
```bash
npm install
```

3. 创建`.env.local`文件，添加环境变量
```
REPOSITORY=yourusername/deepseek-search-agent
GITHUB_TOKEN=your_github_token
```

4. 启动开发服务器
```bash
npm run dev
```

## 项目结构

```
deepseek-search-agent/
├── .github/                # GitHub Actions工作流配置
│   └── workflows/
│       └── search-agent.yml  # 搜索代理工作流定义
├── frontend/               # 前端Next.js应用
│   ├── src/
│   │   ├── app/            # Next.js 14 App Router
│   │   │   ├── api/        # API路由
│   │   │   ├── results/    # 结果页面
│   │   │   └── page.tsx    # 主页面
│   │   └── ...
│   └── ...
├── src/                    # 后端Python代码
│   ├── agent.py            # 基本代理实现
│   ├── gh_action_runner.py # GitHub Actions运行器
│   ├── classes/            # 核心类
│   │   ├── tools.py        # 搜索和抓取工具
│   │   └── ...
│   └── ...
└── ...
```

## 使用说明

1. 访问部署后的Vercel网站
2. 在首页输入你的问题或查询
3. 系统会自动触发GitHub Actions处理查询
4. 你将被重定向到结果页面，可以看到：
   - 处理状态（等待中/处理中/已完成/失败）
   - 迭代思考过程
   - 每轮迭代的记忆块和工具调用
   - 最终结果

## 技术栈

- **前端**：Next.js 14, React, TailwindCSS, TypeScript
- **后端**：Python, aiohttp, Jinja2
- **推理**：DeepSeek R1 (通过OpenRouter API)
- **搜索**：Jina AI Search API
- **部署**：GitHub Actions, Vercel

## 贡献

欢迎贡献代码和提出问题！请提交Pull Request或创建Issue。

## 许可证

[MIT License](LICENSE)
````

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

class ScrapTool:
    def __init__(self, gather_links: bool = True) -> None:
        self.gather_links = gather_links

    async def __call__(self, input: str, context: Optional[str] = None) -> str:
        return await self.scrap_webpage(input, context)

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

class SearchResult(Dict[str, str]):
    pass

class SearchTool:
    def __init__(self, timeout: int = 60 * 5) -> None:
        self.timeout = timeout

    async def __call__(self, input: str) -> str:
        results = await self.search(input)
        return self._format_results(results)

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

class Prompt:
    def __init__(self, template: str) -> None:
        self.template = template

    def __call__(self, **variables) -> str:
        prompt = self.template.format(**variables).strip()
        return prompt

    async def run(self, prompt_variables: Dict[str, Any] = {}) -> str:
        prompt = self(**prompt_variables)
        print(f"\nPrompt:\n{prompt}")
        try:
            result = await model(prompt)
            print(f"\nResult:\n{result}")
            return result
        except Exception as e:
            print(e)
            raise

class Workspace:
    def __init__(self):
        self.state = {"status": "IN_PROGRESS", "blocks": {}, "answer": None}

    def to_string(self):
        result = f"Status: {self.state['status']}\nMemory: \n"
        if not self.state["blocks"]:
            result += "... no memory blocks ...\n"
        else:
            for block_id, content in self.state["blocks"].items():
                result += f"<{block_id}>{content}</{block_id}>\n"
        return result

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

    def _generate_unique_block_id(self):
        while True:
            letters = "".join(random.choices(string.ascii_lowercase, k=3))
            digits = "".join(random.choices(string.digits, k=3))
            new_id = f"{letters}-{digits}"
            if new_id not in self.state["blocks"]:
                return new_id

    def is_done(self):
        return self.state["status"] != "IN_PROGRESS"

class Agent:
    tools = {"search": SearchTool(), "scrape": ScrapTool()}

    def __init__(self, task: str, prompt: Prompt):
        self.task = task
        self.prompt = prompt
        self.current_date = datetime.now().strftime("%Y-%m-%d")
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
            return f"Tool execution failed: {e}"

    async def run(self, loop=True, max_rounds: Optional[int] = None) -> Dict[str, Any]:
        while True:
            try:
                await asyncio.sleep(20)
                print("\033c", end="")  # Clear output in terminal

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

                tasks = [
                    self.run_tool(call["tool"], call["input"], self.task)
                    for call in tool_calls
                ]

                tool_outputs = await asyncio.gather(*tasks)

                tool_records = [
                    {**call, "output": output}
                    for call, output in zip(tool_calls, tool_outputs)
                ]

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
    prompt_template = """..."""  # Add your prompt template here
    prompt = Prompt(prompt_template)
    agent = Agent(task=task, prompt=prompt)

    # Run the agent
    asyncio.run(agent.run(loop=False))