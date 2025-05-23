# 🔧 Frontend API 修复和 Debug 模式

## 问题修复

### 🐛 原问题：缺少 workspace_id 参数
- **错误信息**：`缺少 workspace_id 参数`
- **原因**：前端搜索请求没有生成和传递 `workspace_id` 参数
- **影响**：用户无法正常进行搜索

### ✅ 修复内容

#### 1. 前端搜索逻辑修复 (`frontend/src/app/page.tsx`)
- ✅ 生成唯一的 `workspace_id` 和 `search_id`
- ✅ 使用新架构的 API 参数格式
- ✅ 改进错误处理和用户反馈
- ✅ 在 URL 中传递 `workspace_id` 到结果页面

#### 2. 结果页面增强 (`frontend/src/app/results/[id]/page.tsx`)
- ✅ 支持从 URL 参数读取 `workspace_id`
- ✅ 在 API 请求中正确传递 `workspace_id`
- ✅ 增强错误处理和调试信息

#### 3. Debug 模式功能 🐛
- ✅ 主页面和结果页面都支持 debug 模式
- ✅ 设置通过 localStorage 持久化
- ✅ 详细记录 API 请求和响应
- ✅ 一键复制 debug 信息到剪贴板
- ✅ 显示关键参数（search_id, workspace_id）

## 新增功能

### 🆕 Debug 模式使用方法
1. **开启方式**：点击主页面右上角的 "Debug 模式" 复选框
2. **信息展示**：
   - 搜索过程中的 API 调用日志
   - 请求和响应的详细数据
   - 错误信息和状态码
   - Search ID 和 Workspace ID
3. **导出功能**：点击 "📋 复制 Debug 信息" 按钮
4. **持久化**：设置自动保存在浏览器本地存储中

### 📊 改进的参数结构
```json
{
  "query": "用户查询",
  "workspace_id": "唯一工作空间ID",
  "search_id": "唯一搜索ID", 
  "callback_url": "回调URL",
  "max_results": 10,
  "include_scraping": true
}
```

## 部署步骤

### 1. 提交代码
```bash
git add .
git commit -m "fix: 修复 workspace_id 参数缺失问题，添加 debug 模式"
git push origin main
```

### 2. Vercel 自动部署
- Vercel 会自动检测代码变更并重新部署
- 部署完成后，新的修复将立即生效

### 3. 验证修复
1. **基本功能测试**：
   - 访问新部署的网站
   - 输入测试查询并点击"开始搜索"
   - 确认能正常跳转到结果页面，不再出现"缺少 workspace_id 参数"错误

2. **Debug 模式测试**：
   - 开启 Debug 模式
   - 进行一次搜索
   - 查看 debug 信息是否正确记录
   - 复制 debug 信息并验证内容

### 4. 环境变量检查
确保 Vercel 项目中配置了以下环境变量：
- `OPENROUTER_API_KEY`：OpenRouter API 密钥
- `JINA_API_KEY`：Jina AI API 密钥  
- `GITHUB_TOKEN`：GitHub Actions 令牌
- `GITHUB_REPOSITORY`：GitHub 仓库名（如 `username/repo-name`）

## 测试验证

### 手动测试清单
- [ ] 主页面加载正常
- [ ] Debug 模式开关工作
- [ ] 搜索请求成功发送
- [ ] 结果页面正确接收参数
- [ ] Debug 信息正确显示
- [ ] 复制 debug 信息功能正常

### API 测试脚本
运行 `frontend/test_api.js` 进行自动化测试：
```bash
cd frontend
node test_api.js
```

## 问题诊断

如果仍然遇到问题，请：
1. 开启 Debug 模式
2. 进行搜索操作
3. 复制 debug 信息
4. 将 debug 信息提供给开发者

Debug 信息包含：
- 完整的请求参数
- API 响应数据
- 错误详情和状态码
- 时间戳和执行流程

## 下一步优化

1. **实时状态更新**：实现 WebSocket 连接用于实时状态推送
2. **搜索历史**：添加搜索历史记录功能
3. **结果缓存**：实现结果缓存机制
4. **错误重试**：添加自动重试机制
5. **进度指示器**：更详细的搜索进度显示 