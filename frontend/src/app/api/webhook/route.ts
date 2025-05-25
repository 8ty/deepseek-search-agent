import { NextResponse } from 'next/server';
import memoryStorage from '../../../lib/storage';
import { put } from '@vercel/blob';
import { redisUtils } from '../../../lib/upstash';

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
    console.log('=== WEBHOOK POST 接收数据 ===');
    console.log('完整请求体:', JSON.stringify(body, null, 2));

    // 从URL参数获取search_id（GitHub Action发送时会在URL中）
    const url = new URL(request.url);
    const searchId = url.searchParams.get('id');
    console.log('URL参数中的search_id:', searchId);

    if (!searchId) {
      console.error('缺少search_id参数');
      return NextResponse.json({ error: '缺少 searchId 参数' }, { status: 400 });
    }

    // 解析GitHub Action发送的数据格式
    const { type, data, timestamp } = body;
    console.log('数据类型:', type);
    console.log('数据内容:', data);

    // 获取现有搜索数据
    let existingData = memoryStorage.get(`search:${searchId}`) || {
      search_id: searchId,
      status: 'pending',
      iterations: [],
      query: data?.task || data?.query || 'Unknown',
      createdAt: new Date().toISOString(),
      results: null
    };

    // 根据更新类型处理数据
    let updatedData = { ...existingData };
    
    switch (type) {
      case 'start':
        updatedData.status = 'running';
        updatedData.query = data?.task || updatedData.query;
        console.log('搜索开始:', data?.task);
        break;
        
      case 'iteration':
        updatedData.status = 'running';
        if (data) {
          updatedData.iterations = updatedData.iterations || [];
          updatedData.iterations.push({
            round: data.round,
            timestamp: timestamp || new Date().toISOString(),
            workspace_state: data.workspace_state,
            tool_calls: data.tool_calls,
            response_json: data.response_json,
            raw_response: data.raw_response
          });
        }
        console.log(`迭代更新 - 轮次 ${data?.round}:`, data?.tool_calls?.length || 0, '个工具调用');
        break;
        
      case 'complete':
        updatedData.status = 'completed';
        if (data) {
          updatedData.answer = data.answer;
          updatedData.total_rounds = data.total_rounds;
          updatedData.iterations = data.iterations || updatedData.iterations;
          updatedData.results = {
            answer: data.answer,
            iterations: data.iterations,
            total_rounds: data.total_rounds,
            completedAt: timestamp || new Date().toISOString()
          };
        }
        console.log('搜索完成:', data?.answer?.substring(0, 100) + '...');
        break;
        
      case 'timeout':
        updatedData.status = 'timeout';
        if (data) {
          updatedData.message = data.message;
          updatedData.summary = data.summary;
          updatedData.iterations = data.iterations || updatedData.iterations;
          updatedData.final_state = data.final_state;
          updatedData.results = {
            status: 'timeout',
            message: data.message,
            summary: data.summary,
            iterations: data.iterations,
            final_state: data.final_state,
            completedAt: timestamp || new Date().toISOString()
          };
        }
        console.log('搜索超时:', data?.message);
        break;
        
      case 'error':
        updatedData.status = 'error';
        if (data) {
          updatedData.error = data.error;
          updatedData.traceback = data.traceback;
          updatedData.results = {
            status: 'error',
            error: data.error,
            traceback: data.traceback,
            completedAt: timestamp || new Date().toISOString()
          };
        }
        console.log('搜索错误:', data?.error);
        break;
        
      default:
        console.warn('未知的更新类型:', type);
    }

    updatedData.updatedAt = new Date().toISOString();

    // 存储到内存
    memoryStorage.set(`search:${searchId}`, updatedData);
    console.log('数据已存储到内存存储');

    // 优先存储到 Upstash Redis
    try {
      const searchData = {
        search_id: searchId,
        status: updatedData.status,
        query: updatedData.query,
        results: updatedData.results,
        iterations: updatedData.iterations,
        answer: updatedData.answer,
        error: updatedData.error,
        createdAt: updatedData.createdAt,
        updatedAt: updatedData.updatedAt,
        total_rounds: updatedData.total_rounds,
        message: updatedData.message,
        summary: updatedData.summary,
        final_state: updatedData.final_state,
        traceback: updatedData.traceback
      };

      await redisUtils.setSearchData(searchId, searchData);
      console.log(`搜索数据已存储到Upstash Redis: ${searchId}`);
    } catch (redisError) {
      console.warn('Upstash Redis存储失败，尝试Vercel Blob:', redisError);
      
      // 如果 Redis 失败，回退到 Vercel Blob
      try {
        const blobData = {
          search_id: searchId,
          status: updatedData.status,
          query: updatedData.query,
          results: updatedData.results,
          iterations: updatedData.iterations,
          answer: updatedData.answer,
          error: updatedData.error,
          createdAt: updatedData.createdAt,
          updatedAt: updatedData.updatedAt,
          total_rounds: updatedData.total_rounds,
          message: updatedData.message,
          summary: updatedData.summary,
          final_state: updatedData.final_state,
          traceback: updatedData.traceback
        };

        await put(`searches/${searchId}.json`, JSON.stringify(blobData), {
          access: 'public',
          addRandomSuffix: false
        });
        console.log(`搜索数据已存储到Vercel Blob: searches/${searchId}.json`);
      } catch (blobError) {
        console.warn('Vercel Blob存储也失败，使用内存存储:', blobError);
      }
    }

    console.log('=== WEBHOOK 处理完成 ===');
    return NextResponse.json({ 
      success: true, 
      message: '搜索数据已保存',
      search_id: searchId,
      type: type,
      status: updatedData.status
    });

  } catch (error) {
    console.error('Webhook 处理失败:', error);
    return NextResponse.json(
      { error: 'Webhook 处理失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}