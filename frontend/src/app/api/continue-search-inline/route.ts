import { NextRequest, NextResponse } from 'next/server';
import memoryStorage from '../../../lib/storage';
import { list, put } from '@vercel/blob';
import { redisUtils } from '../../../lib/upstash';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('=== 页面内继续搜索API调用 ===');
    console.log('请求体:', JSON.stringify(body, null, 2));
    
    const { search_id, max_rounds = 3, inline_mode = true } = body;
    
    if (!search_id) {
      console.error('❌ 搜索ID缺失');
      return NextResponse.json(
        { error: "搜索ID缺失" },
        { status: 400 }
      );
    }

    console.log(`🔍 页面内继续搜索 - 搜索ID: ${search_id}, 额外轮数: ${max_rounds}`);

    // 优先从 Upstash Redis 读取之前的搜索状态
    let previousSearchState = null;
    try {
      previousSearchState = await redisUtils.getSearchData(search_id);
      if (previousSearchState) {
        console.log(`✅ 从Upstash Redis读取到搜索状态: ${search_id}`);
      }
    } catch (redisError) {
      console.warn('⚠️ 从Upstash Redis读取搜索状态失败，尝试Vercel Blob:', redisError);
    }

    // 如果 Redis 中没有，尝试从 Vercel Blob 读取
    if (!previousSearchState) {
      try {
        const listResult = await list({
          prefix: `searches/${search_id}.json`,
          limit: 1
        });
        
        if (listResult.blobs.length > 0) {
          const blob = listResult.blobs[0];
          const blobResponse = await fetch(blob.url);
          if (blobResponse.ok) {
            const blobText = await blobResponse.text();
            previousSearchState = JSON.parse(blobText);
            console.log(`✅ 从Blob读取到搜索状态: ${search_id}`);
          }
        }
      } catch (blobError) {
        console.warn('⚠️ 从Blob读取搜索状态失败，尝试从内存读取:', blobError);
      }
    }

    // 如果都没有，尝试从内存读取
    if (!previousSearchState) {
      previousSearchState = memoryStorage.get(`search:${search_id}`);
      if (previousSearchState) {
        console.log('✅ 从内存读取到搜索状态');
      }
    }

    if (!previousSearchState) {
      console.error(`❌ 未找到原始搜索数据，搜索ID: ${search_id}`);
      return NextResponse.json(
        { 
          error: "未找到原始搜索数据",
          details: {
            search_id: search_id,
            suggestion: "请确认搜索ID是否正确，或者原始搜索是否已完成"
          }
        },
        { status: 404 }
      );
    }

    console.log(`✅ 找到搜索状态，查询: ${previousSearchState.query}`);

    // 生成新的搜索ID用于继续搜索
    const newSearchId = `${search_id}-inline-continue-${Date.now()}`;
    
    // 准备完整的搜索历史信息（传递给GitHub Actions）
    const fullSearchHistory = {
      original_query: previousSearchState.query,
      original_search_id: search_id,
      previous_iterations: previousSearchState.iterations || [],
      previous_result: previousSearchState.result || previousSearchState.answer || previousSearchState.summary,
      previous_status: previousSearchState.status,
      total_previous_rounds: previousSearchState.iterations?.length || 0,
      // 传递完整的迭代历史，包括工具调用结果
      detailed_history: previousSearchState.iterations?.map((iter: any) => ({
        round: iter.round,
        timestamp: iter.timestamp,
        workspace_state: iter.workspace_state,
        tool_calls: iter.tool_calls || [],
        response_json: iter.response_json,
        raw_response: iter.raw_response
      })) || []
    };

    // 获取GitHub配置
    const envGithubToken = process.env.GITHUB_TOKEN;
    const envGithubRepository = process.env.GITHUB_REPOSITORY;
    
    if (!envGithubToken || !envGithubRepository) {
      console.log('⚠️ GitHub Actions 配置检查:');
      console.log('- GITHUB_TOKEN存在:', !!envGithubToken);
      console.log('- GITHUB_REPOSITORY存在:', !!envGithubRepository);
      
      // 创建一个模拟的继续搜索结果
      const mockSearchData = {
        status: 'completed' as const,
        query: `页面内继续搜索：${previousSearchState.query}`,
        createdAt: new Date().toISOString(),
        iterations: [
          {
            round: 1,
            timestamp: new Date().toISOString(),
            workspace_state: `Status: CONFIGURATION_MISSING\n<config-info>GitHub Actions 配置缺失，无法执行真实的继续搜索。\n\n基于已有的搜索历史（${previousSearchState.iterations?.length || 0} 轮迭代），建议您：\n\n1. 检查已收集的信息是否满足需求\n2. 配置 GitHub Actions 以启用真实的继续搜索功能\n\n原始查询: ${previousSearchState.query}</config-info>`,
            tool_calls: [
              {
                tool: 'config_check',
                input: '检查GitHub Actions配置',
                output: 'GitHub Token 和 Repository 配置缺失'
              }
            ]
          }
        ],
        result: null,
        answer: `🔧 **页面内继续搜索配置提示**\n\n当前 GitHub Actions 未完全配置，无法执行真实的继续搜索。\n\n**历史信息摘要：**\n- 原始查询：${previousSearchState.query}\n- 已执行轮数：${previousSearchState.iterations?.length || 0}\n- 之前状态：${previousSearchState.status}\n\n**配置状态：**\n- GitHub Token: ${!!envGithubToken ? '✅ 已配置' : '❌ 缺失'}\n- GitHub Repository: ${!!envGithubRepository ? '✅ 已配置' : '❌ 缺失'}\n\n**建议操作：**\n1. 在 Vercel 项目设置中配置环境变量\n2. 设置 \`GITHUB_TOKEN\` 和 \`GITHUB_REPOSITORY\`\n3. 重新部署后即可使用页面内继续搜索功能`,
        search_id: newSearchId,
        parent_search_id: search_id,
        is_inline_continuation: true
      };
      
      // 存储模拟数据
      memoryStorage.set(`search:${newSearchId}`, mockSearchData);
      
      // 尝试存储到 Redis
      try {
        await redisUtils.setSearchData(newSearchId, mockSearchData);
      } catch (error) {
        console.warn('存储到Redis失败:', error);
      }
      
      return NextResponse.json({
        status: "inline_continue_initiated",
        message: "页面内继续搜索已启动（配置模式）",
        search_id: newSearchId,
        parent_search_id: search_id,
        mode: "configuration_required"
      });
    }

    // 创建新的搜索状态
    const newSearchData = {
      status: 'pending' as const,
      query: `页面内继续搜索：${previousSearchState.query}`,
      createdAt: new Date().toISOString(),
      iterations: [],
      result: null,
      search_id: newSearchId,
      parent_search_id: search_id,
      is_inline_continuation: true
    };
    
    // 存储到内存
    memoryStorage.set(`search:${newSearchId}`, newSearchData);

    // 优先存储到 Upstash Redis
    try {
      await redisUtils.setSearchData(newSearchId, newSearchData);
      console.log(`✅ 新搜索状态已存储到Upstash Redis: ${newSearchId}`);
    } catch (redisError) {
      console.warn('⚠️ 存储新搜索状态到Upstash Redis失败，尝试Vercel Blob:', redisError);
      
      // 如果 Redis 失败，回退到 Vercel Blob
      try {
        await put(`searches/${newSearchId}.json`, JSON.stringify(newSearchData), {
          access: 'public',
          addRandomSuffix: false
        });
        console.log(`✅ 新搜索状态已存储到Vercel Blob: ${newSearchId}`);
      } catch (blobError) {
        console.warn('⚠️ 存储新搜索状态到Blob也失败:', blobError);
      }
    }

    // 准备继续搜索的数据，使用enhanced_search.yml工作流格式
    // 这次我们传递完整的历史信息作为前置条件
    const continueSearchData = {
      query: `基于历史信息继续搜索：${previousSearchState.query}`,
      callback_url: getCallbackUrl(request),
      workspace_id: newSearchId,
      max_rounds: max_rounds,
      include_scraping: true,
      debug_mode: false,
      silent_mode: true,
      // 将完整的搜索历史信息传递给GitHub Actions
      continue_metadata: JSON.stringify({
        is_inline_continuation: true,
        parent_search_id: search_id,
        search_id: newSearchId,
        full_history: fullSearchHistory,
        instruction: `这是一个页面内继续搜索请求。请基于以下完整的搜索历史信息，继续深入搜索用户的问题：

原始查询: ${fullSearchHistory.original_query}
已执行轮数: ${fullSearchHistory.total_previous_rounds}
之前的结果: ${fullSearchHistory.previous_result || '无结果'}

详细历史:
${fullSearchHistory.detailed_history.map((iter: any, i: number) => 
  `第${iter.round}轮 (${iter.timestamp}): 执行了${iter.tool_calls?.length || 0}个工具调用`
).join('\n')}

请基于这些信息，进行更深入的搜索，补充遗漏的信息，或从不同角度探索问题。`
      })
    };

    console.log(`🚀 准备触发GitHub Actions页面内继续搜索，搜索ID: ${newSearchId}`);

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
            event_type: 'continue_search',
            client_payload: continueSearchData
          })
        }
      );

      if (!githubResponse.ok) {
        const errorText = await githubResponse.text();
        console.error('❌ GitHub API 调用失败:', {
          status: githubResponse.status,
          statusText: githubResponse.statusText,
          error: errorText
        });
        
        return NextResponse.json(
          { 
            error: "GitHub Actions 触发失败",
            details: {
              status: githubResponse.status,
              statusText: githubResponse.statusText,
              githubError: errorText
            }
          },
          { status: 500 }
        );
      }

      console.log(`✅ GitHub Actions 页面内继续搜索触发成功! 搜索ID: ${newSearchId}`);
      
      return NextResponse.json({
        status: "inline_continue_initiated",
        message: "页面内继续搜索已启动",
        search_id: newSearchId,
        parent_search_id: search_id,
        additional_rounds: max_rounds,
        mode: "github_actions"
      });

    } catch (error) {
      console.error('❌ GitHub Actions 页面内继续搜索触发出错:', error);
      return NextResponse.json(
        { error: "页面内继续搜索请求失败" },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('❌ 页面内继续搜索API错误:', error);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 }
    );
  }
}

function getCallbackUrl(request: NextRequest): string {
  // 尝试从环境变量获取
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhook`;
  }
  
  // 从请求头获取host信息
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  
  if (host) {
    return `${protocol}://${host}/api/webhook`;
  }
  
  // 兜底默认值
  return 'https://your-app.vercel.app/api/webhook';
} 