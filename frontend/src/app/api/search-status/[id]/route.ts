import { NextRequest, NextResponse } from 'next/server';

// 引用webhook route中的内存存储，实际项目中应使用共享的存储服务
const memoryStore: Record<string, any> = {};

// 尝试导入Vercel KV，如果不可用则使用内存存储
let kv: any;
try {
  kv = require('@vercel/kv');
} catch (error) {
  console.log('Vercel KV not available, using memory storage');
  // 继续使用内存存储
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const searchId = params.id;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');

    if (!workspaceId) {
      return NextResponse.json(
        { 
          error: "缺少 workspace_id 参数",
          code: "MISSING_WORKSPACE_ID" 
        },
        { status: 400 }
      );
    }

    // 获取搜索数据
    let searchData = null;

    // 如果Vercel KV可用，优先从KV获取数据
    if (kv) {
      try {
        searchData = await kv.get(`search:${searchId}`) as any;
      } catch (kvError) {
        console.error('Error retrieving data from KV:', kvError);
        // 回退到内存存储
        searchData = memoryStore[`search:${searchId}`];
      }
    } else {
      // 使用内存存储
      searchData = memoryStore[`search:${searchId}`];
    }

    if (!searchData) {
      return NextResponse.json(
        { error: 'Search not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(searchData);

  } catch (error) {
    console.error('获取搜索状态失败:', error);
    return NextResponse.json(
      { 
        error: "获取搜索状态失败",
        code: "STATUS_FETCH_FAILED",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const searchId = params.id;
    const body = await request.json();
    const workspaceId = body.workspace_id;

    if (!workspaceId) {
      return NextResponse.json(
        { 
          error: "缺少 workspace_id 参数",
          code: "MISSING_WORKSPACE_ID" 
        },
        { status: 400 }
      );
    }

    // 在生产环境中，这里应该调用后端 API
    // 模拟搜索结果
    const mockResults = {
      search_id: searchId,
      workspace_id: workspaceId,
      results: {
        search_plan: {
          search_keywords: ["示例关键词"],
          search_strategy: "直接搜索用户查询",
          expected_sources: ["网页", "文档"],
          analysis_focus: "全面分析"
        },
        search_results: [
          {
            title: "示例搜索结果",
            url: "https://example.com",
            description: "这是一个示例搜索结果"
          }
        ],
        final_answer: "这是基于搜索结果生成的最终回答。"
      }
    };

    return NextResponse.json(mockResults);

  } catch (error) {
    console.error('获取搜索结果失败:', error);
    return NextResponse.json(
      { 
        error: "获取搜索结果失败",
        code: "RESULTS_FETCH_FAILED",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}