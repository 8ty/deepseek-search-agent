# DeepSeek Search Agent 前端应用

这是 DeepSeek Search Agent 的前端应用，使用 Next.js 构建，并部署在 Vercel 上。

## 功能

- 提供用户界面让用户输入搜索查询
- 通过 GitHub Actions 触发搜索代理的执行
- 接收和显示搜索结果及迭代过程
- 美观的结果展示界面，突出显示每次思考迭代

## 技术栈

- Next.js 14 (App Router)
- React
- Tailwind CSS 
- Vercel Serverless Functions (用于接收 GitHub Actions 的回调)

## 项目结构

```
frontend/
├── app/
│   ├── api/
│   │   └── webhook/
│   │       └── route.ts    # 接收GitHub Actions回调的API路由
│   ├── page.tsx            # 主页面
│   ├── layout.tsx          # 应用布局
│   └── results/
│       └── [id]/
│           └── page.tsx    # 结果页面
├── components/             # React组件
├── lib/                    # 实用函数和API客户端
├── public/                 # 静态资源
└── tailwind.config.js      # Tailwind配置
```

## 部署

1. 将代码推送到GitHub仓库
2. 在Vercel上连接该仓库
3. 配置环境变量：
   - `GITHUB_TOKEN`: 用于触发GitHub Actions的令牌
   - `REPOSITORY`: GitHub仓库名称(格式: owner/repo)

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```