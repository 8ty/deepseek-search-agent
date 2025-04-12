import { NextResponse } from 'next/server';

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
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const searchId = params.id;

    if (!searchId) {
      return NextResponse.json(
        { error: 'Missing search ID' },
        { status: 400 }
      );
    }

    // 获取搜索数据
    let searchData = null;

    // 如果Vercel KV可用，优先从KV获取数据
    if (kv) {
      try {
        searchData = await kv.get<any>(`search:${searchId}`);
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
    console.error('Error getting search status:', error);

    return NextResponse.json(
      { error: 'Failed to get search status' },
      { status: 500 }
    );
  }
}