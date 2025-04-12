import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

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

    // 从Vercel KV获取搜索数据
    try {
      const searchData = await kv.get<any>(`search:${searchId}`);

      if (!searchData) {
        return NextResponse.json(
          { error: 'Search not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(searchData);

    } catch (kvError) {
      console.error('Error retrieving data from KV:', kvError);

      // 在实际部署中，这里应该有回退策略
      return NextResponse.json(
        { error: 'Failed to retrieve search data' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error getting search status:', error);

    return NextResponse.json(
      { error: 'Failed to get search status' },
      { status: 500 }
    );
  }
}