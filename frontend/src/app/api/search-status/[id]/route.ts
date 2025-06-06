import { NextRequest, NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import memoryStorage from '../../../../lib/storage';
import { redisUtils } from '../../../../lib/upstash';

// 注意：在生产环境中应该使用真实的数据库或KV存储
// 目前使用共享内存存储进行演示

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: '缺少搜索ID' }, { status: 400 });
    }

    // 首先尝试从 Upstash Redis 获取
    let searchData;
    try {
      searchData = await redisUtils.getSearchData(id);
      if (searchData) {
        console.log(`从 Upstash Redis 读取到搜索数据: ${id}`);
      }
    } catch (error) {
      console.warn('Upstash Redis 不可用，尝试 Vercel Blob:', error);
    }

    // 如果 Redis 没有数据，尝试从 Vercel Blob 获取
    if (!searchData) {
      try {
        const blobList = await list({
          prefix: 'searches/',
          limit: 1000
        });

        const targetBlob = blobList.blobs.find(blob => 
          blob.pathname === `searches/${id}.json`
        );

        if (targetBlob) {
          const response = await fetch(targetBlob.url);
          if (response.ok) {
            searchData = await response.json();
            console.log(`从 Vercel Blob 读取到搜索数据: ${id}`);
          }
        }
      } catch (error) {
        console.warn('Vercel Blob不可用，回退到内存存储:', error);
      }
    }

    // 如果都没有数据，回退到内存存储
    if (!searchData) {
      searchData = memoryStorage.get(`search:${id}`);
      if (searchData) {
        console.log(`从内存存储读取到搜索数据: ${id}`);
      }
    }

    if (!searchData) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    return NextResponse.json(searchData);
  } catch (error) {
    console.error('获取搜索状态失败:', error);
    return NextResponse.json(
      { error: '获取搜索状态失败' },
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