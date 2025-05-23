# DeepSeek Search Agent

基于GitHub Actions运行DeepSeek R1推理模型的搜索智能体，显示完整的搜索和思考过程。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyourusername%2Fdeepseek-search-agent&env=REPOSITORY,GITHUB_TOKEN&project-name=deepseek-search-agent&repository-name=deepseek-search-agent)

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
2. 部署平台账号（Vercel、Cloudflare、Netlify或Render）
3. Jina AI API密钥 (从[jina.ai](https://jina.ai)获取)
4. OpenRouter API密钥 (从[openrouter.ai](https://openrouter.ai)获取)

### 步骤1：准备GitHub仓库

1. Fork或克隆此仓库到你的GitHub账户
2. 在GitHub仓库设置中添加以下密钥：
   - `JINA_API_KEY`：你的Jina AI API密钥
   - `OPENROUTER_API_KEY`：你的OpenRouter API密钥
   - `GITHUB_TOKEN`：具有workflow权限的个人访问令牌

### 部署选项

您可以选择以下任一平台部署前端应用：

#### 选项1：部署到Vercel

1. 在Vercel上导入你的GitHub仓库
2. 设置构建配置：
   - 框架预设：Next.js
   - 构建命令：`cd frontend && npm install && npm run build`
   - 输出目录：`frontend/.next`
3. 添加环境变量：
   - `REPOSITORY`：你的GitHub仓库名（格式：owner/repo），改成GITHUB_REPOSITORY
   - `GITHUB_TOKEN`：具有workflow权限的个人访问令牌
4. （可选）如果使用Vercel KV存储：
   - 在Vercel控制台中创建一个KV数据库
   - 关联KV数据库到你的项目

更多详细指南请参见 [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md)

#### 选项2：部署到Cloudflare Pages/Workers

1. 登录到 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 导航到 Pages 并点击 "创建项目"
3. 连接你的GitHub仓库
4. 配置构建设置：
   - 框架预设：Next.js
   - 构建命令：`cd frontend && npm install && npm run build`
   - 输出目录：`frontend/.next`
   - 环境变量：
     - `REPOSITORY`：你的GitHub仓库名
     - `GITHUB_TOKEN`：GitHub个人访问令牌
5. 部署应用
6. 对于需要服务器端逻辑的API路由:
   - 在 `frontend/next.config.js` 文件中添加 Cloudflare Pages 适配
   - 或使用 Cloudflare Workers 作为API端点替代

**存储替代方案**：使用 Cloudflare KV 替代 Vercel KV，需要进行相应代码调整。

#### 选项3：部署到Netlify

1. 登录到 [Netlify](https://app.netlify.com/)
2. 点击 "新建站点" 并选择 "从Git导入"
3. 连接你的GitHub仓库
4. 配置构建设置：
   - 基础目录: `frontend`
   - 构建命令: `npm run build`
   - 发布目录: `.next`
5. 添加环境变量：
   - `REPOSITORY`：GitHub仓库路径
   - `GITHUB_TOKEN`：GitHub令牌
6. 部署应用
7. 对于API路由，需要配置 Netlify Functions:
   - 在 `frontend/netlify.toml` 文件中添加函数配置
   - 调整API路由以使用 Netlify Functions 格式

**存储替代方案**：可以使用 Netlify Functions + 外部数据库服务（如MongoDB Atlas或Firebase）替代Vercel KV。

#### 选项4：部署到Render

1. 登录到 [Render](https://dashboard.render.com/)
2. 点击 "New" 并选择 "Web Service"
3. 连接你的GitHub仓库
4. 配置服务设置：
   - 名称：自定义名称
   - 构建命令：`cd frontend && npm install && npm run build`
   - 启动命令：`cd frontend && npm start`
   - 环境变量：
     - `REPOSITORY`：GitHub仓库路径
     - `GITHUB_TOKEN`：GitHub令牌
5. 部署应用
6. API路由将作为Web服务的一部分运行

**存储替代方案**：可以使用Render提供的PostgreSQL或Redis数据库，或集成第三方存储解决方案。

### 部署后回调配置调整

无论使用哪个平台部署，都需要确保GitHub Actions可以正确回调到新的部署URL。需要在GitHub Actions工作流文件中更新回调URL。

检查 `.github/workflows/search-agent.yml` 文件，并确保其中的回调URL与您新的部署域名匹配。

### 步骤3：测试部署

1. 打开部署后的网站
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


