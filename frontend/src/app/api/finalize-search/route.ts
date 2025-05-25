import { NextRequest, NextResponse } from 'next/server';
import memoryStorage from '../../../lib/storage';
import { list, put } from '@vercel/blob';

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 开始处理finalize-search请求');
    
    const body = await request.json();
    console.log('📥 请求体:', JSON.stringify(body, null, 2));
    
    const { search_id } = body;
    
    if (!search_id) {
      console.log('❌ 错误: 搜索ID缺失');
      return NextResponse.json(
        { error: "搜索ID缺失" },
        { status: 400 }
      );
    }

    console.log(`🔍 开始查找搜索状态，search_id: ${search_id}`);

    // 从Vercel Blob读取之前的搜索状态
    let previousSearchState = null;
    try {
      console.log('📡 尝试从Vercel Blob读取搜索状态...');
      // 使用list方法来检查文件是否存在，然后读取内容
      const listResult = await list({
        prefix: `searches/${search_id}.json`,
        limit: 1
      });
      
      console.log(`🔍 Blob list结果: 找到 ${listResult.blobs.length} 个文件`);
      
      if (listResult.blobs.length > 0) {
        const blob = listResult.blobs[0];
        console.log(`📄 找到Blob文件: ${blob.pathname}, URL: ${blob.url}`);
        
        // 通过URL获取blob内容
        const blobResponse = await fetch(blob.url);
        if (blobResponse.ok) {
          const blobText = await blobResponse.text();
          previousSearchState = JSON.parse(blobText);
          console.log(`✅ 从Blob读取到搜索状态用于总结: ${search_id}`);
        } else {
          console.warn('⚠️ Blob响应不成功:', blobResponse.status, blobResponse.statusText);
        }
      } else {
        console.warn(`⚠️ Blob中未找到搜索状态: searches/${search_id}.json`);
      }
    } catch (blobError) {
      console.warn('⚠️ 从Blob读取搜索状态失败，尝试从内存读取:', blobError);
    }

    // 如果Blob中没有，尝试从内存读取
    if (!previousSearchState) {
      console.log('🧠 尝试从内存读取搜索状态...');
      previousSearchState = memoryStorage.get(`search:${search_id}`);
      if (previousSearchState) {
        console.log('✅ 从内存读取到搜索状态');
      } else {
        console.log('❌ 内存中也没有找到搜索状态');
      }
    }

    if (!previousSearchState) {
      console.log(`❌ 错误: 未找到原始搜索数据，search_id: ${search_id}`);
      return NextResponse.json(
        { error: "未找到原始搜索数据" },
        { status: 404 }
      );
    }

    console.log('✅ 成功找到搜索状态，开始创建总结任务...');

    // 生成新的搜索ID用于总结任务
    const finalizeSearchId = `${search_id}-summary-${Date.now()}`;
    console.log(`🆔 生成新的总结搜索ID: ${finalizeSearchId}`);
    
    // 准备精简的历史数据用于总结
    const summaryData = {
      original_query: previousSearchState.query,
      total_iterations: previousSearchState.iterations?.length || 0,
      key_findings: previousSearchState.iterations?.map((iter: any, index: number) => ({
        round: iter.round,
        timestamp: iter.timestamp,
        findings: iter.tool_calls?.map((call: any) => `${call.tool}: ${call.input.substring(0, 100)}...`) || [],
        workspace_summary: iter.workspace_state?.substring(0, 200) + '...' || ''
      })) || [],
      partial_result: previousSearchState.result || previousSearchState.answer || '搜索过程中收集的信息需要进一步整理',
      completion_status: previousSearchState.status
    };

    console.log(`📋 准备的总结数据包含 ${summaryData.total_iterations} 轮迭代`);

    // 创建新的搜索数据用于总结任务
    const finalizeSearchData = {
      status: 'pending' as const,
      query: `基于现有信息生成最终结果：${previousSearchState.query}`,
      createdAt: new Date().toISOString(),
      iterations: [],
      result: null,
      search_id: finalizeSearchId,
      parent_search_id: search_id,
      is_finalization: true
    };
    
    console.log('💾 存储到内存...');
    memoryStorage.set(`search:${finalizeSearchId}`, finalizeSearchData);

    // 将新搜索状态存储到Blob
    try {
      console.log('💾 存储到Blob...');
      await put(`searches/${finalizeSearchId}.json`, JSON.stringify(finalizeSearchData), {
        access: 'public',
        addRandomSuffix: false
      });
      console.log('✅ Blob存储成功');
    } catch (blobError) {
      console.warn('⚠️ 存储总结任务状态到Blob失败:', blobError);
    }

    // 获取GitHub配置
    console.log('🔧 检查GitHub配置...');
    const envGithubToken = process.env.GITHUB_TOKEN;
    const envGithubRepository = process.env.GITHUB_REPOSITORY;
    
    if (!envGithubToken || !envGithubRepository) {
      console.log(`❌ GitHub配置缺失: TOKEN=${!!envGithubToken}, REPO=${!!envGithubRepository}`);
      return NextResponse.json(
        { error: "GitHub配置未完成，无法生成最终结果" },
        { status: 500 }
      );
    }

    console.log(`✅ GitHub配置正常: REPO=${envGithubRepository}`);

    // 准备GitHub Actions数据（传递精简的总结信息）
    const finalizeData = {
      test_scope: `总结并生成最终答案：${previousSearchState.query}`,
      test_config: getCallbackUrl(request),
      environment: finalizeSearchId,
      search_id: finalizeSearchId,
      test_rounds: 1, // 总结只需要1轮
      include_scraping: false, // 总结任务不需要爬取新内容
      debug_mode: false,
      quiet_mode: true,
      // 传递要总结的信息
      summary_context: JSON.stringify(summaryData),
      action_type: 'finalize',
      parent_search_id: search_id
    };

    console.log('🚀 准备触发GitHub Actions...');

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
            event_type: 'search_trigger',
            client_payload: finalizeData
          })
        }
      );

      console.log(`📡 GitHub API响应状态: ${githubResponse.status}`);

      if (!githubResponse.ok) {
        const errorText = await githubResponse.text();
        console.error('❌ GitHub Actions 生成最终结果触发失败:', errorText);
        return NextResponse.json(
          { error: "触发生成最终结果失败" },
          { status: 500 }
        );
      }

      console.log(`✅ GitHub Actions 生成最终结果触发成功! 总结搜索ID: ${finalizeSearchId}`);
      
      return NextResponse.json({
        status: "finalize_initiated",
        message: "正在基于现有信息生成最终结果",
        search_id: finalizeSearchId,
        parent_search_id: search_id,
        // 返回新的搜索结果页面URL
        redirect_url: `/results/${finalizeSearchId}`
      });

    } catch (error) {
      console.error('❌ GitHub Actions 生成最终结果触发出错:', error);
      return NextResponse.json(
        { error: "生成最终结果请求失败" },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('❌ 生成最终结果API错误:', error);
    console.error('错误堆栈:', error instanceof Error ? error.stack : 'No stack trace');
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