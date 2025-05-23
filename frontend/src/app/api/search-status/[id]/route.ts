import { NextRequest, NextResponse } from 'next/server';
import memoryStorage from '../../../../lib/storage';

// 注意：在生产环境中应该使用真实的数据库或KV存储
// 目前使用共享内存存储进行演示

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

    console.log('=== SEARCH STATUS DEBUG ===');
    console.log('Search ID:', searchId);
    console.log('Workspace ID:', workspaceId);
    console.log('Memory Store Key:', `search:${searchId}`);
    console.log('Current memory store keys:', memoryStorage.keys());
    console.log('All memory store data:', 'Available keys: ' + memoryStorage.keys().join(', '));

    // 使用共享存储
    searchData = memoryStorage.get(`search:${searchId}`);
    
    console.log('Retrieved data:', searchData);
    console.log('=== END SEARCH STATUS DEBUG ===');

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