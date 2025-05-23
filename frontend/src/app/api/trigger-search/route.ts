import { NextRequest, NextResponse } from 'next/server';

// 引用与search-status相同的内存存储
const memoryStore: Record<string, any> = {};

// 注意：在生产环境中应该使用真实的数据库或KV存储
// 目前使用内存存储进行演示

// 注意：在生产环境中，这些 API 路由应该代理到后端服务
// 这里只是为了演示新架构的接口

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
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
    memoryStore[`search:${searchId}`] = searchData;

    // 模拟搜索过程 - 在几秒后自动完成（仅用于演示）
    setTimeout(() => {
      const completedData = {
        ...searchData,
        status: 'completed' as const,
        result: `针对查询"${body.query}"的模拟搜索结果：

这是一个自动生成的演示结果。在实际部署中，这里会是来自DeepSeek R1模型的真实搜索和分析结果。

**查询分析：**
您的问题：${body.query}

**搜索策略：**
1. 关键词提取和分析
2. 多源信息搜索
3. 结果综合和验证
4. 个性化回答生成

**模拟结果：**
基于您的查询，我已经完成了相关信息的搜索和分析。这是一个演示版本的回答，实际版本会包含更详细和准确的信息。`,
        iterations: [
          {
            round: 1,
            timestamp: new Date().toISOString(),
            workspace_state: 'Status: Processing\n<search-1>正在分析用户查询</search-1>',
            tool_calls: [
              {
                tool: 'search',
                input: body.query,
                output: '找到相关信息...'
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
      memoryStore[`search:${searchId}`] = completedData;
    }, 3000); // 3秒后完成

    // 准备 Webhook 数据
    const webhookData = {
      query: body.query,
      workspace_id: workspaceId,
      search_id: searchId,
      max_rounds: body.max_rounds || 5,
      include_scraping: body.include_scraping !== false,
      callback_url: body.callback_url || `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhook`
    };

    // 在生产环境中，这里应该调用 GitHub Actions 或后端服务
    // 目前返回模拟响应
    const response = {
      status: "search_initiated",
      message: "搜索已开始，结果将通过回调发送",
      query: body.query,
      workspace_id: workspaceId,
      search_id: searchId,
      timestamp: new Date().toISOString()
    };

    // 触发 GitHub Actions（如果在生产环境）
    if (process.env.NODE_ENV === 'production' && process.env.GITHUB_TOKEN) {
      try {
        const githubResponse = await fetch(
          `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/dispatches`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              event_type: 'search_trigger',
              client_payload: webhookData
            })
          }
        );

        if (!githubResponse.ok) {
          console.error('GitHub Actions 触发失败:', await githubResponse.text());
        }
      } catch (error) {
        console.error('GitHub Actions 触发出错:', error);
      }
    }

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
  return NextResponse.json({
    message: "使用 POST 方法触发搜索",
    required_fields: ["query"],
    optional_fields: ["workspace_id", "max_rounds", "include_scraping", "callback_url"]
  });
}