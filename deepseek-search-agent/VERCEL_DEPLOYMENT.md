# Vercel部署详细指南

本文档提供了将DeepSeek Search Agent部署到Vercel平台的详细步骤。

## 一键部署 (推荐)

最简单的方法是使用一键部署按钮：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyourusername%2Fdeepseek-search-agent&env=REPOSITORY,GITHUB_TOKEN&project-name=deepseek-search-agent&repository-name=deepseek-search-agent)

点击此按钮后，Vercel会引导您完成以下步骤：
1. 登录或创建Vercel账号
2. 导入GitHub仓库
3. 配置环境变量
4. 部署应用

## 手动部署步骤

如果您想手动控制部署过程，请按照以下步骤操作。

### 1. Fork或克隆仓库

首先，将此仓库Fork或克隆到您的GitHub账户中。

### 2. 准备GitHub配置

在GitHub仓库设置中，需添加以下Actions密钥（位于Settings > Secrets > Actions）：
- `JINA_API_KEY` - 从[jina.ai](https://jina.ai)获取
- `OPENROUTER_API_KEY` - 从[openrouter.ai](https://openrouter.ai)获取

另外，您需要创建一个GitHub个人访问令牌（位于Settings > Developer settings > Personal access tokens > Tokens(classic)）：
- 需要选择`workflow`和`repo`权限
- 此令牌将用于触发GitHub Actions，需在Vercel中配置

### 3. 在Vercel上部署前端

1. 登录[Vercel](https://vercel.com)
2. 点击"Add New..."，然后选择"Project"
3. 导入您的GitHub仓库
4. 配置项目设置：
   - **框架预设**: 选择Next.js
   - **根目录**: `frontend`
   - **构建命令**: `npm run build`（默认）
   - **输出目录**: `.next`（默认）

### 4. 配置Vercel环境变量

在Vercel项目设置中，添加以下环境变量（位于Settings > Environment Variables）：

| 变量名 | 描述 | 示例 |
|--------|------|-------|
| `REPOSITORY` | 您的GitHub仓库路径 | yourusername/deepseek-search-agent |
| `GITHUB_TOKEN` | GitHub个人访问令牌 | ghp_xxxxxxxxxxxx |

注意：这些环境变量会被安全地存储，不会暴露在前端代码中。

### 5. （可选）配置Vercel KV存储

为了存储搜索状态和结果，我们建议使用Vercel KV：

1. 在Vercel控制台中，转到"Storage"选项卡
2. 点击"Create"按钮并选择"KV Database"
3. 按照向导完成创建
4. 创建完成后，将KV数据库关联到您的项目
5. Vercel会自动将KV连接信息添加为环境变量

如果您不使用Vercel KV，系统将回退到使用API路由状态管理，但会有以下限制：
- 搜索结果将不会持久化存储
- 服务器重启后结果将丢失
- 无法在多个实例间共享状态

### 6. 部署

配置完成后，点击"Deploy"按钮。Vercel会自动构建和部署您的应用。

### 7. 验证部署

部署完成后，访问Vercel提供的URL，测试以下功能：

1. 在首页输入查询
2. 验证GitHub Actions是否被正确触发（可在GitHub仓库的Actions选项卡中查看）
3. 确认结果页面能够正确显示处理状态和迭代过程

## 环境变量的安全管理

Vercel提供了多种环境变量管理选项：

### 1. 预览环境变量

您可以为不同环境（开发、预览、生产）配置不同的环境变量。这在团队协作时特别有用。

### 2. 加密存储

所有环境变量都存储在Vercel的加密系统中，不会暴露在源代码或构建日志中。

### 3. 团队共享

如果您使用Vercel团队功能，可以在团队成员间共享环境变量，无需每个人单独配置。

## 部署更新

当您推送更改到GitHub仓库时，Vercel会自动检测并重新部署应用。您也可以在Vercel控制台中手动触发部署。

## 疑难解答

### 部署失败

如果部署失败，请检查以下内容：

1. **构建日志**: 查看Vercel构建日志，找出具体错误
2. **环境变量**: 确认所有必需的环境变量已正确配置
3. **依赖项**: 确认package.json中的依赖项正确无误

### GitHub Actions未触发

如果GitHub Actions未被触发，请检查：

1. **GitHub Token**: 确认令牌有效且具有workflow权限
2. **仓库路径**: 确认REPOSITORY环境变量格式正确（owner/repo）

### 回调URL问题

如果GitHub Actions执行但结果未显示，可能是回调URL配置问题：

1. 确认您的Vercel应用可以接收外部请求
2. 检查GitHub Actions日志中的回调错误
3. 验证网络环境允许GitHub Actions服务器访问您的Vercel应用

## 附录：完整环境变量列表

| 环境变量 | 必填 | 描述 |
|---------|-----|------|
| `REPOSITORY` | 是 | GitHub仓库路径（owner/repo格式） |
| `GITHUB_TOKEN` | 是 | 具有workflow权限的GitHub个人访问令牌 |
| `KV_REST_API_URL` | 否 | Vercel KV REST API URL（使用Vercel KV时自动配置） |
| `KV_REST_API_TOKEN` | 否 | Vercel KV REST API Token（使用Vercel KV时自动配置） |