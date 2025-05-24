import { NextRequest, NextResponse } from 'next/server';
import memoryStorage from '../../../lib/storage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { search_id, workspace_id, query, iterations, final_state } = body;
    
    if (!search_id) {
      return NextResponse.json(
        { error: "搜索ID缺失" },
        { status: 400 }
      );
    }

    // 获取现有搜索数据
    const existingSearch = memoryStorage.get(`search:${search_id}`);
    if (!existingSearch) {
      return NextResponse.json(
        { error: "未找到原始搜索数据" },
        { status: 404 }
      );
    }

    // 更新搜索状态为处理中
    const updatedSearchData = {
      ...existingSearch,
      status: 'processing' as const,
      updatedAt: new Date().toISOString()
    };
    
    memoryStorage.set(`search:${search_id}`, updatedSearchData);

    // 获取GitHub配置
    const envGithubToken = process.env.GITHUB_TOKEN;
    const envGithubRepository = process.env.GITHUB_REPOSITORY;
    
    if (!envGithubToken || !envGithubRepository) {
      return NextResponse.json(
        { error: "GitHub配置未完成，无法生成最终结果" },
        { status: 500 }
      );
    }

    // 准备生成最终结果的数据
    const finalizeData = {
      query: query,
      workspace_id: workspace_id,
      search_id: search_id,
      iterations: iterations,
      final_state: final_state,
      callback_url: getCallbackUrl(request),
      debug_mode: false,
      silent_mode: true,
      action_type: 'finalize'
    };

    // 触发GitHub Actions生成最终结果
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
            event_type: 'finalize_search',
            client_payload: finalizeData
          })
        }
      );

      if (!githubResponse.ok) {
        const errorText = await githubResponse.text();
        console.error('GitHub Actions 生成最终结果触发失败:', errorText);
        return NextResponse.json(
          { error: "触发生成最终结果失败" },
          { status: 500 }
        );
      }

      console.log('✅ GitHub Actions 生成最终结果触发成功!');
      
      return NextResponse.json({
        status: "finalize_initiated",
        message: "正在基于现有信息生成最终结果",
        search_id: search_id,
        workspace_id: workspace_id
      });

    } catch (error) {
      console.error('GitHub Actions 生成最终结果触发出错:', error);
      return NextResponse.json(
        { error: "生成最终结果请求失败" },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('生成最终结果API错误:', error);
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