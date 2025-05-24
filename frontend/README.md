# DeepSeek Search Agent - Frontend

这是 DeepSeek Search Agent 的前端应用，使用 Next.js 构建，并部署在 Vercel 上。

## 功能

- 提供用户界面让用户输入搜索查询
- 通过 GitHub Actions 触发搜索代理的执行
- 接收和显示搜索结果及迭代过程
- 美观的结果展示界面，突出显示每次思考迭代
- 使用 Vercel Blob 持久化存储搜索结果

## 技术栈

- Next.js 14 (App Router)
- React
- Tailwind CSS 
- Vercel Blob (文件存储)
- Vercel Serverless Functions (用于接收 GitHub Actions 的回调)

## 环境变量配置

### 必需的环境变量

1. **BLOB_READ_WRITE_TOKEN** - Vercel Blob读写令牌
   ```
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxx
   ```

2. **其他环境变量**
   - `GITHUB_TOKEN` - GitHub访问令牌
   - `WEBHOOK_URL` - Webhook回调URL

## Vercel Blob 设置

1. 在Vercel Dashboard中，进入Storage页面
2. 选择"Blob" > "Create New"
3. 创建新的Blob存储
4. 获取读写令牌并配置到`BLOB_READ_WRITE_TOKEN`环境变量

## Vercel Blob 优势

- ✅ **免费额度** - Hobby计划包含免费使用量
- 📁 **文件组织** - 支持文件夹结构 (`searches/search-id.json`)
- 🔒 **访问控制** - 支持公开和私有文件
- 💾 **大容量** - 适合存储复杂的搜索结果
- 🌐 **CDN缓存** - 全球边缘缓存，访问速度快
- 📊 **数据持久化** - 解决"Search not found"问题

## 项目结构

```
frontend/
├── app/
│   ├── api/
│   │   ├── webhook/
│   │   │   └── route.ts    # 接收GitHub Actions回调的API路由
│   │   ├── blob/
│   │   │   └── searches/
│   │   │       └── [id]/
│   │   │           └── route.ts    # Blob数据读取API
│   │   └── search-status/
│   │       └── [id]/
│   │           └── route.ts    # 搜索状态查询API
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
   - `BLOB_READ_WRITE_TOKEN`: Vercel Blob访问令牌

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 数据存储结构

搜索结果存储在Vercel Blob中，文件结构如下：
```
searches/
├── search-1234567890.json    # 搜索状态和结果
├── search-1234567891.json
└── ...
```

每个JSON文件包含：
- `status`: 搜索状态 (pending, processing, completed, failed)
- `query`: 用户查询
- `results`: 搜索结果数据
- `createdAt`: 创建时间
- `updatedAt`: 更新时间