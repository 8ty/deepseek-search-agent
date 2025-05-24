import { NextRequest, NextResponse } from 'next/server';
import memoryStorage from '../../../lib/storage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { search_id, workspace_id, max_rounds = 3, current_state } = body;
    
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

    // 更新搜索状态为运行中
    const updatedSearchData = {
      ...existingSearch,
      status: 'running' as const,
      updatedAt: new Date().toISOString()
    };
    
    memoryStorage.set(`search:${search_id}`, updatedSearchData);

    // 获取GitHub配置
    const envGithubToken = process.env.GITHUB_TOKEN;
    const envGithubRepository = process.env.GITHUB_REPOSITORY;
    
    if (!envGithubToken || !envGithubRepository) {
      return NextResponse.json(
        { error: "GitHub配置未完成，无法继续搜索" },
        { status: 500 }
      );
    }

    // 准备继续搜索的数据，映射到GitHub Actions期望的字段名
    const continueSearchData = {
      test_scope: existingSearch.query,          // GitHub Actions 期望 test_scope
      test_config: getCallbackUrl(request),      // GitHub Actions 期望 test_config 
      environment: search_id,                    // GitHub Actions 期望 environment
      search_id: search_id,                      // 保留兼容
      test_rounds: max_rounds,                   // GitHub Actions 期望 test_rounds
      include_scraping: true,
      debug_mode: false,
      quiet_mode: true,                          // GitHub Actions 期望 quiet_mode
      continue_from_state: current_state,
      is_continuation: true
    };

    // 触发GitHub Actions继续搜索（使用统一的 search_trigger 事件类型）
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
            event_type: 'search_trigger',  // 使用统一的事件类型
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

      console.log('✅ GitHub Actions 继续搜索触发成功!');
      
      return NextResponse.json({
        status: "continue_search_initiated",
        message: "继续搜索已启动",
        search_id: search_id,
        workspace_id: workspace_id,
        additional_rounds: max_rounds
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