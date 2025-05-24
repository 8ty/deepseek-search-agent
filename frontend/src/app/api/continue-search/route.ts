import { NextRequest, NextResponse } from 'next/server';
import memoryStorage from '../../../lib/storage';
import { list, put } from '@vercel/blob';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { search_id, max_rounds = 3 } = body;
    
    if (!search_id) {
      return NextResponse.json(
        { error: "搜索ID缺失" },
        { status: 400 }
      );
    }

    // 从Vercel Blob读取之前的搜索状态
    let previousSearchState = null;
    try {
      // 使用list方法来检查文件是否存在，然后读取内容
      const listResult = await list({
        prefix: `searches/${search_id}.json`,
        limit: 1
      });
      
      if (listResult.blobs.length > 0) {
        const blob = listResult.blobs[0];
        // 通过URL获取blob内容
        const blobResponse = await fetch(blob.url);
        if (blobResponse.ok) {
          const blobText = await blobResponse.text();
          previousSearchState = JSON.parse(blobText);
          console.log(`从Blob读取到搜索状态: ${search_id}`);
        } else {
          console.warn('Blob响应不成功:', blobResponse.status, blobResponse.statusText);
        }
      } else {
        console.warn(`Blob中未找到搜索状态: searches/${search_id}.json`);
      }
    } catch (blobError) {
      console.warn('从Blob读取搜索状态失败，尝试从内存读取:', blobError);
    }

    // 如果Blob中没有，尝试从内存读取
    if (!previousSearchState) {
      previousSearchState = memoryStorage.get(`search:${search_id}`);
    }

    if (!previousSearchState) {
      return NextResponse.json(
        { error: "未找到原始搜索数据" },
        { status: 404 }
      );
    }

    // 生成新的搜索ID用于继续搜索
    const newSearchId = `${search_id}-continue-${Date.now()}`;
    
    // 准备精简的搜索状态数据（只包含必要信息）
    const compactSearchState = {
      original_query: previousSearchState.query,
      previous_iterations: previousSearchState.iterations?.map((iter: any) => ({
        round: iter.round,
        timestamp: iter.timestamp,
        workspace_state: iter.workspace_state,
        summary: iter.tool_calls?.length > 0 ? `执行了${iter.tool_calls.length}个工具调用` : '无工具调用'
      })) || [],
      previous_result: previousSearchState.result || previousSearchState.answer,
      total_previous_rounds: previousSearchState.iterations?.length || 0
    };

    // 更新内存中的搜索状态
    const newSearchData = {
      status: 'running' as const,
      query: previousSearchState.query,
      createdAt: new Date().toISOString(),
      iterations: [],
      result: null,
      search_id: newSearchId,
      parent_search_id: search_id,
      is_continuation: true
    };
    
    memoryStorage.set(`search:${newSearchId}`, newSearchData);

    // 将新搜索状态也存储到Blob
    try {
      await put(`searches/${newSearchId}.json`, JSON.stringify(newSearchData), {
        access: 'public',
        addRandomSuffix: false
      });
    } catch (blobError) {
      console.warn('存储新搜索状态到Blob失败:', blobError);
    }

    // 获取GitHub配置
    const envGithubToken = process.env.GITHUB_TOKEN;
    const envGithubRepository = process.env.GITHUB_REPOSITORY;
    
    if (!envGithubToken || !envGithubRepository) {
      return NextResponse.json(
        { error: "GitHub配置未完成，无法继续搜索" },
        { status: 500 }
      );
    }

    // 准备GitHub Actions数据（只传递必要信息）
    const continueSearchData = {
      test_scope: `继续搜索：${previousSearchState.query}`,
      test_config: getCallbackUrl(request),
      environment: newSearchId,
      search_id: newSearchId,
      test_rounds: max_rounds,
      include_scraping: true,
      debug_mode: false,
      quiet_mode: true,
      // 传递精简的上下文信息
      previous_context: JSON.stringify(compactSearchState),
      is_continuation: true,
      parent_search_id: search_id
    };

    // 触发GitHub Actions继续搜索
    try {
      const githubResponse = await fetch(
        `https://api.github.com/repos/${envGithubRepository}/dispatches`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${envGithubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            event_type: 'search_trigger',
            client_payload: continueSearchData
          })
        }
      );

      if (!githubResponse.ok) {
        const errorText = await githubResponse.text();
        console.error('GitHub Actions 继续搜索触发失败:', errorText);
        return NextResponse.json(
          { error: "触发继续搜索失败" },
          { status: 500 }
        );
      }

      console.log(`✅ GitHub Actions 继续搜索触发成功! 新搜索ID: ${newSearchId}`);
      
      return NextResponse.json({
        status: "continue_search_initiated",
        message: "继续搜索已启动",
        search_id: newSearchId,
        parent_search_id: search_id,
        additional_rounds: max_rounds,
        // 返回新的搜索结果页面URL
        redirect_url: `/results/${newSearchId}`
      });

    } catch (error) {
      console.error('GitHub Actions 继续搜索触发出错:', error);
      return NextResponse.json(
        { error: "继续搜索请求失败" },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('继续搜索API错误:', error);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 }
    );
  }
}

function getCallbackUrl(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}/api/webhook`;
} 