import { NextResponse } from 'next/server';
import memoryStorage from '../../../lib/storage';

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
    const searchParams = new URL(request.url).searchParams;
    const searchId = searchParams.get('id');

    if (!searchId) {
      return NextResponse.json(
        { error: 'Missing search ID' },
        { status: 400 }
      );
    }

    const payload = await request.json();
    const { type, data, timestamp } = payload;

    if (!type || !data || !timestamp) {
      return NextResponse.json(
        { error: 'Invalid payload format' },
        { status: 400 }
      );
    }

    // 获取现有的搜索数据
    let existingData: any = null;

    // 使用共享存储
    existingData = memoryStorage.get(`search:${searchId}`);

    // 初始化或更新搜索数据
    const searchData = existingData || {
      status: 'pending',
      createdAt: timestamp,
      updates: [],
      iterations: [],
      result: null
    };

    // 根据更新类型进行处理
    switch (type) {
      case 'start':
        searchData.status = 'processing';
        searchData.query = data.task;
        searchData.updates.push({ type, timestamp, data });
        break;

      case 'iteration':
        searchData.iterations.push({
          round: data.round,
          timestamp,
          workspace_state: data.workspace_state,
          tool_calls: data.tool_calls
        });
        searchData.updates.push({ type, timestamp, data: { round: data.round } });
        break;

      case 'complete':
        searchData.status = 'completed';
        searchData.result = data.answer;
        searchData.updates.push({ type, timestamp });
        break;

      case 'error':
      case 'timeout':
        searchData.status = 'failed';
        searchData.error = data.message || data.error;
        searchData.updates.push({ type, timestamp, data });
        break;
    }

    // 保存更新的数据
    memoryStorage.set(`search:${searchId}`, searchData);

    return NextResponse.json({
      success: true,
      searchId
    });

  } catch (error) {
    console.error('Error processing webhook:', error);

    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}