import { NextRequest, NextResponse } from 'next/server';
import memoryStorage from '../../../lib/storage';
import { put } from '@vercel/blob';
import { redisUtils } from '../../../lib/upstash';

// 注意：在生产环境中应该使用真实的数据库或KV存储
// 目前使用共享内存存储进行演示

// 注意：在生产环境中，这些 API 路由应该代理到后端服务
// 这里只是为了演示新架构的接口

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 首先检查是否配置了访问密钥控制
    const secretKey = process.env.ACCESS_SECRET_KEY;
    
    // 如果配置了访问密钥，则需要验证
    if (secretKey) {
      const accessKey = body.access_key;
      
      if (!accessKey) {
        return NextResponse.json(
          { 
            error: "需要提供访问密钥",
            code: "ACCESS_KEY_REQUIRED" 
          },
          { status: 401 }
        );
      }
      
      if (accessKey !== secretKey) {
        return NextResponse.json(
          { 
            error: "访问密钥无效",
            code: "INVALID_ACCESS_KEY" 
          },
          { status: 403 }
        );
      }
      
      console.log('✅ 访问密钥验证通过');
    } else {
      console.log('ℹ️ 未配置访问密钥，跳过验证');
    }
    
    // 验证请求数据
    if (!body.query) {
      return NextResponse.json(
        { 
          error: "查询参数缺失",
          code: "MISSING_QUERY" 
        },
        { status: 400 }
      );
    }

    // 生成ID（如果没有提供的话）
    const searchId = body.search_id || `search-${Date.now()}`;
    const workspaceId = body.workspace_id || `ws-${Date.now()}`;
    
    // 获取GitHub配置
    const githubConfig = body.github_config;
    
    // 优先使用环境变量，如果环境变量存在就自动使用
    const envGithubToken = process.env.GITHUB_TOKEN;
    const envGithubRepository = process.env.GITHUB_REPOSITORY;
    
    // 如果有环境变量配置，优先使用环境变量，否则使用用户输入的配置
    const githubToken = envGithubToken || githubConfig?.token;
    const githubRepository = envGithubRepository || githubConfig?.repository;
    
    // 如果环境变量已配置，或者用户强制触发，就启用GitHub Actions
    const shouldTriggerGitHub = (envGithubToken && envGithubRepository) || 
                               githubConfig?.force_trigger || 
                               (process.env.NODE_ENV === 'production' && githubToken);

    // 初始化搜索数据
    const searchData = {
      status: 'pending' as const,
      query: body.query,
      createdAt: new Date().toISOString(),
      iterations: [],
      result: null,
      workspace_id: workspaceId,
      search_id: searchId
    };

    // 存储搜索数据
    console.log('=== TRIGGER SEARCH DEBUG ===');
    console.log('Search ID:', searchId);
    console.log('Workspace ID:', workspaceId);
    console.log('Environment GitHub Token exists:', !!envGithubToken);
    console.log('Environment GitHub Repository:', envGithubRepository);
    console.log('Should trigger GitHub:', shouldTriggerGitHub);
    console.log('=== END TRIGGER SEARCH DEBUG ===');
    
    memoryStorage.set(`search:${searchId}`, searchData);

    // 优先存储到 Upstash Redis
    const searchStateData = {
      status: 'pending',
      query: body.query,
      createdAt: new Date().toISOString(),
      results: null,
      search_id: searchId,
      workspace_id: workspaceId
    };
    
    try {
      await redisUtils.setSearchData(searchId, searchStateData);
      console.log(`搜索状态已存储到Upstash Redis: ${searchId}`);
    } catch (redisError) {
      console.warn('Upstash Redis存储失败，尝试Vercel Blob:', redisError);
      
      // 如果 Redis 失败，回退到 Vercel Blob
      try {
        await put(`searches/${searchId}.json`, JSON.stringify(searchStateData), {
          access: 'public',
          addRandomSuffix: false
        });
        console.log(`搜索状态已存储到Vercel Blob: searches/${searchId}.json`);
      } catch (blobError) {
        console.warn('Vercel Blob存储也失败，使用内存存储:', blobError);
      }
    }

    // 准备 Webhook 数据，映射到GitHub Actions期望的字段名
    const webhookData = {
      test_scope: body.query,                    // GitHub Actions 期望 test_scope，实际是搜索查询
      test_config: body.callback_url || getCallbackUrl(request), // GitHub Actions 期望 test_config，实际是回调URL
      environment: searchId,                     // GitHub Actions 期望 environment，用于WORKSPACE_ID
      search_id: searchId,                       // 保留原有字段以便兼容
      test_rounds: body.max_rounds || 5,         // GitHub Actions 期望 test_rounds，实际是最大轮数
      include_scraping: body.include_scraping !== false,
      debug_mode: body.debug_mode || false,
      quiet_mode: body.silent_mode !== false,   // GitHub Actions 期望 quiet_mode，实际是静默模式
      enable_user_interaction: body.enable_user_interaction || false  // 新增：用户交互模式选项
    };

    // 触发 GitHub Actions（如果配置了Token和Repository）
    console.log('=== GITHUB ACTIONS DEBUG ===');
    console.log('Should trigger GitHub:', shouldTriggerGitHub);
    console.log('GitHub Token exists:', !!githubToken);
    console.log('GitHub Repository:', githubRepository);
    console.log('=== END GITHUB ACTIONS DEBUG ===');
    
    if (shouldTriggerGitHub && githubToken && githubRepository) {
      try {
        const githubResponse = await fetch(
          `https://api.github.com/repos/${githubRepository}/dispatches`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              // event_type: 'search-request',中斜杠是另一个
              event_type: 'search_trigger',
              client_payload: webhookData
            })
          }
        );

        if (!githubResponse.ok) {
          const errorText = await githubResponse.text();
          console.error('GitHub Actions 触发失败:', errorText);
        } else {
          console.log('✅ GitHub Actions 触发成功!');
        }
      } catch (error) {
        console.error('GitHub Actions 触发出错:', error);
      }
    } else {
      // 开发环境 - 添加模拟搜索完成（用于测试）
      console.log('Development mode: Adding mock completion in 10 seconds');
      setTimeout(() => {
        const completedData = {
          ...searchData,
          status: 'completed' as const,
          result: `**模拟搜索结果** (开发环境)

针对查询："${body.query}"

这是开发环境下的模拟结果。实际部署时，会由GitHub Actions调用DeepSeek R1模型进行真实搜索。

**模拟分析过程：**
1. 查询分析：已识别关键词
2. 网络搜索：模拟找到相关资源  
3. 内容分析：模拟深度分析
4. 结果综合：生成回答

**下一步：**
- 部署到生产环境以使用真实的GitHub Actions
- 配置必要的API密钥 (OPENROUTER_API_KEY, JINA_API_KEY)`,
          iterations: [
            {
              round: 1,
              timestamp: new Date().toISOString(),
              workspace_state: 'Status: Processing\n<search-1>正在分析用户查询</search-1>',
              tool_calls: [
                {
                  tool: 'search',
                  input: body.query,
                  output: '模拟搜索结果：找到相关网页...'
                }
              ]
            },
            {
              round: 2,
              timestamp: new Date().toISOString(),
              workspace_state: 'Status: Completed\n<result-1>搜索完成，已生成回答</result-1>',
              tool_calls: [
                {
                  tool: 'analyze',
                  input: '分析搜索结果',
                  output: '分析完成，生成最终答案'
                }
              ]
            }
          ]
        };
        memoryStorage.set(`search:${searchId}`, completedData);
        console.log('Mock search completed for:', searchId);
      }, 10000); // 10秒后完成
    }

    // 在生产环境中，这里应该调用 GitHub Actions 或后端服务
    // 目前返回模拟响应
    const response = {
      status: "search_initiated",
      message: "搜索已开始，结果将通过回调发送",
      query: body.query,
      workspace_id: workspaceId,
      search_id: searchId,
      timestamp: new Date().toISOString(),
      // 返回环境变量配置状态，让前端知道是否需要手动配置
      environment_configured: !!(envGithubToken && envGithubRepository)
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('触发搜索失败:', error);
    return NextResponse.json(
      { 
        error: "启动搜索失败",
        code: "SEARCH_INIT_FAILED",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // 检查环境变量配置状态
  const envConfigured = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY);
  const accessControlEnabled = !!process.env.ACCESS_SECRET_KEY;
  
  return NextResponse.json({
    message: "使用 POST 方法触发搜索",
    required_fields: accessControlEnabled ? ["query", "access_key"] : ["query"],
    optional_fields: ["workspace_id", "max_rounds", "include_scraping", "callback_url", "debug_mode", "silent_mode"],
    environment_configured: envConfigured,
    access_control_enabled: accessControlEnabled,
    github_token_exists: !!process.env.GITHUB_TOKEN,
    github_repository: process.env.GITHUB_REPOSITORY || null
  });
}

// Helper function to get callback URL
function getCallbackUrl(request: NextRequest): string {
  // 尝试从环境变量获取
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhook`;
  }
  
  // 从请求头获取host信息
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  
  if (host) {
    return `${protocol}://${host}/api/webhook`;
  }
  
  // 兜底默认值
  return 'https://your-app.vercel.app/api/webhook';
}