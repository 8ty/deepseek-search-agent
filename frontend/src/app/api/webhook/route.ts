import { NextResponse } from 'next/server';

// 内存存储，用于演示目的或当Vercel KV不可用时
const memoryStore: Record<string, any> = {};

// 尝试导入Vercel KV，如果不可用则使用内存存储
let kv: any;
try {
  kv = require('@vercel/kv');
} catch (error) {
  console.log('Vercel KV not available, using memory storage');
  // 继续使用内存存储
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

    // 如果Vercel KV可用，尝试从KV获取数据
    if (kv) {
      try {
        existingData = await kv.get(`search:${searchId}`);
      } catch (kvError) {
        console.error('Error retrieving data from KV:', kvError);
        // 回退到内存存储
        existingData = memoryStore[`search:${searchId}`];
      }
    } else {
      // 使用内存存储
      existingData = memoryStore[`search:${searchId}`];
    }

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
    if (kv) {
      try {
        await kv.set(`search:${searchId}`, searchData);
      } catch (kvError) {
        console.error('Error storing data in KV:', kvError);
        // 回退到内存存储
        memoryStore[`search:${searchId}`] = searchData;
      }
    } else {
      // 使用内存存储
      memoryStore[`search:${searchId}`] = searchData;
    }

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