import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

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

    // 将回调数据存储到Vercel KV或其他存储中
    // 在真实环境中应该使用数据库或Redis等存储

    // 如果使用Vercel KV (需要先在Vercel上设置)
    try {
      // 获取现有的搜索数据
      const existingData = await kv.get<any>(`search:${searchId}`);
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
      await kv.set(`search:${searchId}`, searchData);

      // 使用客户端事件通知前端 (生产环境中可以使用WebSockets或Server-Sent Events)
      // 这里用Vercel KV只是演示，实际应该使用Socket.io或其他实时通信方式

    } catch (kvError) {
      console.error('Error storing data in KV:', kvError);
      // 如果KV不可用，回退到文件系统存储或内存存储
      // 为了演示简单，这里不实现回退逻辑
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