import { NextRequest, NextResponse } from 'next/server';
import memoryStorage from '../../../lib/storage';
import { list, put } from '@vercel/blob';
import { redisUtils } from '../../../lib/upstash';
import { 
  isAccessKeyConfigured, 
  verifyAccessKey, 
  extractAccessKeyFromRequest,
  createAccessKeyErrorResponse 
} from '../../../lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('=== 继续搜索API调用 ===');
    console.log('请求体:', JSON.stringify(body, null, 2));
    
    // 1. 访问权限控制验证
    if (isAccessKeyConfigured()) {
      const providedKey = extractAccessKeyFromRequest(body);
      
      if (!providedKey || !verifyAccessKey(providedKey)) {
        console.log('❌ 继续搜索访问被拒绝：访问密钥无效');
        return NextResponse.json(
          createAccessKeyErrorResponse(),
          { status: 401 }
        );
      }
      
      console.log('✅ 继续搜索访问密钥验证通过');
    }
    
    const { search_id, max_rounds = 3 } = body;
    
    if (!search_id) {
      console.error('❌ 搜索ID缺失');
      return NextResponse.json(
        { error: "搜索ID缺失" },
        { status: 400 }
      );
    }

    console.log(`🔍 搜索ID: ${search_id}, 额外轮数: ${max_rounds}`);

    // 优先从 Upstash Redis 读取之前的搜索状态
    let previousSearchState = null;
    try {
      previousSearchState = await redisUtils.getSearchData(search_id);
      if (previousSearchState) {
        console.log(`从Upstash Redis读取到搜索状态: ${search_id}`);
      }
    } catch (redisError) {
      console.warn('从Upstash Redis读取搜索状态失败，尝试Vercel Blob:', redisError);
    }

    // 如果 Redis 中没有，尝试从 Vercel Blob 读取
    if (!previousSearchState) {
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
    }

    // 如果都没有，尝试从内存读取
    if (!previousSearchState) {
      previousSearchState = memoryStorage.get(`search:${search_id}`);
    }

    if (!previousSearchState) {
      console.error(`❌ 未找到原始搜索数据，搜索ID: ${search_id}`);
      console.log('🔍 数据查找总结:');
      console.log('- Upstash Redis: 未找到');
      console.log('- Vercel Blob: 未找到');
      console.log('- 内存存储: 未找到');
      
      return NextResponse.json(
        { 
          error: "未找到原始搜索数据",
          details: {
            search_id: search_id,
            checked_sources: ['upstash_redis', 'vercel_blob', 'memory_storage'],
            suggestion: "请确认搜索ID是否正确，或者原始搜索是否已完成"
          }
        },
        { status: 404 }
      );
    }

    console.log(`✅ 找到搜索状态，查询: ${previousSearchState.query}`);

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

    // 获取GitHub配置（使用环境变量）
    const envGithubToken = process.env.GITHUB_TOKEN;
    const envGithubRepository = process.env.GITHUB_REPOSITORY;
    
    if (!envGithubToken || !envGithubRepository) {
      console.log('⚠️ GitHub Actions 配置检查:');
      console.log('- GITHUB_TOKEN存在:', !!envGithubToken);
      console.log('- GITHUB_REPOSITORY存在:', !!envGithubRepository);
      console.log('- GITHUB_REPOSITORY值:', envGithubRepository);
      
      // 为了调试，我们先创建一个模拟的继续搜索
      const newSearchId = `${search_id}-continue-${Date.now()}`;
      const mockSearchData = {
        status: 'completed' as const,
        query: `继续搜索：${previousSearchState.query}`,
        createdAt: new Date().toISOString(),
        iterations: [
          {
            round: 1,
            timestamp: new Date().toISOString(),
            workspace_state: `Status: DONE\n<result-1>由于 GitHub Actions 未配置，这是一个模拟的继续搜索结果。\n\n基于之前的搜索（${previousSearchState.iterations?.length || 0} 轮迭代），我们建议：\n\n1. 检查已收集的信息是否满足需求\n2. 如需真实的继续搜索，请配置 GitHub Actions\n3. 当前系统已显示基于已有信息的结果\n\n原始查询: ${previousSearchState.query}</result-1>`,
            tool_calls: [
              {
                tool: 'search',
                input: `继续搜索：${previousSearchState.query}`,
                output: '模拟搜索结果 - GitHub Actions 配置缺失'
              }
            ]
          }
        ],
        result: null,
        answer: `🔧 **继续搜索配置提示**\n\n当前 GitHub Actions 未完全配置，无法执行真实的继续搜索。\n\n**配置状态：**\n- GitHub Token: ${!!envGithubToken ? '✅ 已配置' : '❌ 缺失'}\n- GitHub Repository: ${!!envGithubRepository ? '✅ 已配置' : '❌ 缺失'}\n\n**建议操作：**\n1. 在 Vercel 项目设置中配置环境变量\n2. 设置 \`GITHUB_TOKEN\` 和 \`GITHUB_REPOSITORY\`\n3. 重新部署后即可使用继续搜索功能\n\n**当前可用：**\n- 查看已收集的搜索信息（${previousSearchState.iterations?.length || 0} 轮迭代）\n- 基于现有信息的结果分析`,
        search_id: newSearchId,
        parent_search_id: search_id,
        is_continuation: true
      };
      
      // 存储模拟数据以便显示
      memoryStorage.set(`search:${newSearchId}`, mockSearchData);
      
      return NextResponse.json({
        status: "continue_search_initiated",
        message: "继续搜索已启动（模拟模式）",
        search_id: newSearchId,
        parent_search_id: search_id,
        additional_rounds: max_rounds,
        mode: "simulation",
        redirect_url: `/results/${newSearchId}`,
        note: "GitHub Actions 未配置，返回配置说明"
      });
    }

    // 更新内存中的搜索状态
    const newSearchData = {
      status: 'pending' as const,
      query: previousSearchState.query,
      createdAt: new Date().toISOString(),
      iterations: [],
      result: null,
      search_id: newSearchId,
      parent_search_id: search_id,
      is_continuation: true
    };
    
    memoryStorage.set(`search:${newSearchId}`, newSearchData);

    // 优先存储到 Upstash Redis
    try {
      await redisUtils.setSearchData(newSearchId, newSearchData);
      console.log(`新搜索状态已存储到Upstash Redis: ${newSearchId}`);
    } catch (redisError) {
      console.warn('存储新搜索状态到Upstash Redis失败，尝试Vercel Blob:', redisError);
      
      // 如果 Redis 失败，回退到 Vercel Blob
      try {
        await put(`searches/${newSearchId}.json`, JSON.stringify(newSearchData), {
          access: 'public',
          addRandomSuffix: false
        });
        console.log(`新搜索状态已存储到Vercel Blob: ${newSearchId}`);
      } catch (blobError) {
        console.warn('存储新搜索状态到Blob也失败:', blobError);
      }
    }

    // 准备继续搜索的数据，使用 enhanced_search.yml 工作流的字段格式
    // 注意：GitHub Repository Dispatch API 限制 client_payload 最多 10 个属性
    const continueSearchData = {
      query: `继续搜索：${previousSearchState.query}`,      // enhanced_search.yml 期望 query
      callback_url: getCallbackUrl(request),               // enhanced_search.yml 期望 callback_url
      workspace_id: newSearchId,                           // enhanced_search.yml 期望 workspace_id
      max_rounds: max_rounds,                              // enhanced_search.yml 期望 max_rounds
      include_scraping: true,
      debug_mode: false,
      silent_mode: true,                                   // enhanced_search.yml 期望 silent_mode
      // 如果配置了访问密钥，传递给 GitHub Actions 用于回调验证
      access_key: isAccessKeyConfigured() ? extractAccessKeyFromRequest(body) : undefined,
      // 合并继续搜索的元数据到一个属性中
      continue_metadata: JSON.stringify({
        continue_from_state: compactSearchState,
        is_continuation: true,
        parent_search_id: search_id,
        search_id: newSearchId  // 将search_id移到metadata中
      })
    };

    // 触发GitHub Actions继续搜索，使用与第一次搜索相同的事件类型
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
            event_type: 'continue_search',  // 继续搜索使用专门的事件类型
            client_payload: continueSearchData
          })
        }
      );

      if (!githubResponse.ok) {
        const errorText = await githubResponse.text();
        console.error('❌ GitHub API 调用失败:', {
          status: githubResponse.status,
          statusText: githubResponse.statusText,
          error: errorText,
          url: `https://api.github.com/repos/${envGithubRepository}/dispatches`
        });
        
        return NextResponse.json(
          { 
            error: "GitHub Actions 触发失败",
            details: {
              status: githubResponse.status,
              statusText: githubResponse.statusText,
              githubError: errorText,
              repository: envGithubRepository,
              suggestion: githubResponse.status === 404 
                ? "请检查仓库名称格式是否正确（格式：owner/repo）" 
                : githubResponse.status === 401 || githubResponse.status === 403
                ? "请检查 GitHub Token 权限，需要 repo 和 actions 权限"
                : "请检查 GitHub Actions 配置"
            }
          },
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