import { NextResponse } from 'next/server';
import memoryStorage from '../../../lib/storage';
import { put } from '@vercel/edge-config';

// 注意：在生产环境中应该使用真实的数据库或KV存储
// 目前使用共享内存存储进行演示

// GET 方法 - 提供 webhook 信息和测试功能
export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const searchId = searchParams.get('id');

    if (searchId) {
      // 如果提供了搜索ID，返回该搜索的状态信息
      const searchData = memoryStorage.get(`search:${searchId}`);
      
      if (!searchData) {
        return NextResponse.json(
          { 
            error: 'Search not found',
            search_id: searchId,
            available_searches: memoryStorage.keys().filter(key => key.startsWith('search:')).map(key => key.replace('search:', ''))
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        message: 'Webhook endpoint - Search data found',
        search_id: searchId,
        status: searchData.status,
        query: searchData.query,
        created_at: searchData.createdAt,
        iterations_count: searchData.iterations?.length || 0,
        has_result: !!searchData.result
      });
    }

    // 没有搜索ID时，返回webhook端点信息
    return NextResponse.json({
      message: 'DeepSeek 搜索代理 Webhook 端点',
      description: 'This endpoint receives POST requests from GitHub Actions with search progress updates',
      usage: {
        method: 'POST',
        content_type: 'application/json',
        query_parameter: 'id (required) - The search ID',
        payload_format: {
          type: 'string (start|iteration|complete|error|timeout)',
          data: 'object - Type-specific data',
          timestamp: 'string - ISO timestamp'
        }
      },
      test_get: {
        description: 'Add ?id=SEARCH_ID to check status of a specific search',
        example: `${new URL(request.url).origin}${new URL(request.url).pathname}?id=search-123456`
      },
      active_searches: memoryStorage.keys().filter(key => key.startsWith('search:')).map(key => key.replace('search:', ''))
    });

  } catch (error) {
    console.error('GET webhook error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process webhook GET request',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('接收到 webhook 数据:', body);

    const { searchId, status, results, error } = body;

    if (!searchId) {
      return NextResponse.json({ error: '缺少 searchId' }, { status: 400 });
    }

    // 准备搜索数据
    const searchData = {
      status: status || 'completed',
      results: results || null,
      error: error || null,
      updatedAt: new Date().toISOString()
    };

    // 存储到Edge Config（如果可用）
    try {
      await put(`search_${searchId}`, searchData);
      console.log(`搜索结果已存储到Edge Config: search_${searchId}`);
    } catch (edgeConfigError) {
      console.warn('Edge Config存储失败，使用内存存储:', edgeConfigError);
      // 回退到内存存储
      memoryStorage.set(`search:${searchId}`, searchData);
    }

    return NextResponse.json({ 
      success: true, 
      message: '搜索结果已保存' 
    });

  } catch (error) {
    console.error('Webhook 处理失败:', error);
    return NextResponse.json(
      { error: 'Webhook 处理失败' },
      { status: 500 }
    );
  }
}