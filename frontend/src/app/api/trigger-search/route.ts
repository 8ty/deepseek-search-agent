import { NextRequest, NextResponse } from 'next/server';

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

    // 准备 Webhook 数据
    const webhookData = {
      query: body.query,
      workspace_id: body.workspace_id,
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
      workspace_id: webhookData.workspace_id || `ws-${Date.now()}`,
      search_id: `search-${Date.now()}`,
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