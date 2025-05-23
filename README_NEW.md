# 🔍 DeepSeek 搜索代理 - 重构版

基于 DeepSeek R1 推理模型的智能搜索代理，采用模块化架构设计。

## 🏗️ 新架构特点

### ✨ 模块化设计
- **`agent/`** - 核心搜索代理逻辑
- **`api/`** - API 接口层
- **`config/`** - 统一配置管理
- **`frontend/`** - Next.js 前端界面

### 🔧 关键改进
- 消除代码重复
- 统一配置管理
- 清晰的依赖关系
- 更好的错误处理
- 灵活的部署选项

## 📁 项目结构

```
deepseek-search-agent/
├── agent/                    # 核心搜索代理
│   ├── __init__.py
│   ├── search_agent.py      # 主搜索代理类
│   ├── models.py            # AI 模型接口
│   ├── tools.py             # 搜索和抓取工具
│   ├── workspace.py         # 工作空间管理
│   └── utils.py             # 工具函数
├── api/                     # API 接口层
│   ├── __init__.py
│   ├── search_api.py        # 搜索 API 接口
│   ├── github_runner.py     # GitHub Actions 执行器
│   └── webhook_handler.py   # Webhook 处理器
├── config/                  # 配置管理
│   ├── __init__.py
│   └── settings.py          # 统一设置管理
├── frontend/                # Next.js 前端
│   └── src/app/api/         # API 路由
├── main.py                  # 主入口文件
├── requirements.txt         # Python 依赖
└── .github/workflows/       # GitHub Actions 工作流
```

## 🚀 快速开始

### 1. 环境配置

```bash
# 克隆项目
git clone <repository-url>
cd deepseek-search-agent

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，添加 API 密钥
```

### 2. 检查环境

```bash
# 检查配置和环境
python main.py --mode check
```

### 3. 运行模式

#### 📱 命令行搜索
```bash
python main.py --mode search --query "人工智能的发展趋势"
```

#### 🌐 本地开发服务器
```bash
python main.py --mode server
# 访问 http://localhost:8000
```

#### ⚙️ GitHub Actions
```bash
# 在 GitHub Actions 环境中自动运行
python main.py --mode github
```

## 🔑 环境变量

| 变量名 | 描述 | 必需 |
|--------|------|------|
| `OPENROUTER_API_KEY` | OpenRouter API 密钥 | ✅ |
| `JINA_API_KEY` | Jina AI API 密钥 | ✅ |
| `ENVIRONMENT` | 运行环境 (development/production) | ❌ |
| `HOST` | 服务器主机 | ❌ |
| `PORT` | 服务器端口 | ❌ |
| `SEARCH_QUERY` | 搜索查询（GitHub Actions） | ❌ |
| `CALLBACK_URL` | 回调 URL | ❌ |

## 📚 API 接口

### 搜索触发
```http
POST /api/trigger-search
Content-Type: application/json

{
  "query": "搜索查询",
  "workspace_id": "可选的工作空间ID",
  "max_results": 10,
  "include_scraping": true,
  "callback_url": "结果回调URL"
}
```

### 搜索状态
```http
GET /api/search-status/{search_id}?workspace_id={workspace_id}
```

### 搜索结果
```http
POST /api/search-status/{search_id}
Content-Type: application/json

{
  "workspace_id": "工作空间ID"
}
```

## 🏢 部署选项

### 1. Vercel 部署（前端）
```bash
cd frontend
npm install
npm run build
vercel deploy
```

### 2. Render 部署（后端）
- 使用 `render.yaml` 配置文件
- 设置环境变量
- 自动部署

### 3. GitHub Actions
- 配置 Secrets：`OPENROUTER_API_KEY`, `JINA_API_KEY`
- 支持 repository_dispatch 和 workflow_dispatch

## 🔄 工作流程

1. **前端触发** → 用户在界面输入查询
2. **API 接收** → Next.js API 路由接收请求
3. **GitHub Actions** → 触发后端搜索代理
4. **搜索执行** → 使用 Jina AI 搜索和抓取
5. **AI 分析** → DeepSeek R1 分析和生成回答
6. **结果回调** → 通过 Webhook 返回结果
7. **前端展示** → 实时展示搜索结果

## 🧩 核心组件

### SearchAgent
- 主搜索代理类
- 管理搜索流程
- 协调各个工具和模型

### ToolManager
- 管理搜索和抓取工具
- 统一的工具接口
- 支持自定义工具扩展

### Workspace
- 管理搜索状态和历史
- 内存块系统
- 支持多租户

### OpenRouterModel
- DeepSeek R1 模型接口
- 支持推理模式
- 异步调用

## 🔧 开发指南

### 添加新工具
```python
from agent.tools import BaseTool

class CustomTool(BaseTool):
    async def execute(self, *args, **kwargs):
        # 实现工具逻辑
        return result

# 注册工具
tool_manager.add_tool("custom", CustomTool())
```

### 自定义模型
```python
from agent.models import BaseModel

class CustomModel(BaseModel):
    async def generate(self, message: str, **kwargs) -> str:
        # 实现模型调用
        return response
```

### 配置管理
```python
from config import get_settings, update_settings

settings = get_settings()
update_settings(max_results_default=20)
```

## 🐛 故障排除

### 常见问题

1. **API 密钥错误**
   ```bash
   python main.py --mode check
   ```

2. **导入错误**
   ```bash
   pip install -r requirements.txt
   ```

3. **GitHub Actions 失败**
   - 检查 Secrets 配置
   - 查看 Actions 日志

### 调试模式
```bash
# 启用调试模式
export DEBUG=true
python main.py --mode server
```

## 📈 性能优化

- 使用异步 I/O
- 内存块缓存
- 工作空间自动清理
- 请求去重
- 错误重试机制

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 📄 许可证

MIT License

## 🔗 相关链接

- [DeepSeek R1 文档](https://deepseek.com)
- [OpenRouter API](https://openrouter.ai)
- [Jina AI](https://jina.ai)

---

**🎉 重构完成！新架构提供了更好的可维护性、扩展性和部署灵活性。** 