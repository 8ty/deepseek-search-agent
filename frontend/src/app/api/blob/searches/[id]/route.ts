import { NextRequest, NextResponse } from 'next/server';
import { head, list } from '@vercel/blob';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const filename = `${id}.json`;

    if (!id) {
      return NextResponse.json({ error: '缺少搜索ID' }, { status: 400 });
    }

    // 检查文件是否存在
    try {
      const blobList = await list({
        prefix: 'searches/',
        limit: 1000
      });

      const targetBlob = blobList.blobs.find(blob => 
        blob.pathname === `searches/${filename}`
      );

      if (!targetBlob) {
        return NextResponse.json({ error: 'Search not found in blob storage' }, { status: 404 });
      }

      // 获取文件内容
      const response = await fetch(targetBlob.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch blob: ${response.statusText}`);
      }

      const searchData = await response.json();
      return NextResponse.json(searchData);

    } catch (blobError) {
      console.error('读取Blob数据失败:', blobError);
      return NextResponse.json({ error: 'Failed to read from blob storage' }, { status: 500 });
    }

  } catch (error) {
    console.error('获取搜索数据失败:', error);
    return NextResponse.json(
      { error: '获取搜索数据失败' },
      { status: 500 }
    );
  }
} 