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
    console.log('=== 页面内继续搜索API调用 ===');
    console.log('请求体:', JSON.stringify(body, null, 2));
    
    // 1. 访问权限控制验证
    if (isAccessKeyConfigured()) {
      const providedKey = extractAccessKeyFromRequest(body);
      
      if (!providedKey || !verifyAccessKey(providedKey)) {
        console.log('❌ 页面内继续搜索访问被拒绝：访问密钥无效');
        return NextResponse.json(
          createAccessKeyErrorResponse(),
          { status: 401 }
        );
      }
      
      console.log('✅ 页面内继续搜索访问密钥验证通过');
    }
    
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

    // 页面内继续搜索使用原始搜索ID，在同一页面更新状态
    const newSearchId = search_id; // 使用原始搜索ID
    
    // 解析和提取记忆块信息
    const parseMemoryBlocks = (workspaceState: string) => {
      const memoryBlocks: any[] = [];
      const lines = workspaceState.split('\n');
      let currentBlock: any = null;
      
      for (const line of lines) {
        // 提取记忆块
        if (line.includes('<memory>') || line.includes('<search_result>') || line.includes('<analysis>')) {
          const typeMatch = line.match(/<(\w+)>/);
          if (typeMatch) {
            currentBlock = { type: typeMatch[1], content: [] };
          }
        } else if (line.includes('</memory>') || line.includes('</search_result>') || line.includes('</analysis>')) {
          if (currentBlock) {
            memoryBlocks.push({
              ...currentBlock,
              content: currentBlock.content.join('\n')
            });
            currentBlock = null;
          }
        } else if (currentBlock) {
          currentBlock.content.push(line);
        }
      }
      
      return memoryBlocks;
    };

    // 提取关键发现和结果
    const extractKeyFindings = (iterations: any[]) => {
      const findings: any[] = [];
      
      iterations.forEach((iter, index) => {
        const finding: any = {
          round: iter.round,
          timestamp: iter.timestamp,
          tools_used: [],
          key_information: [],
          memory_blocks: []
        };
        
        // 提取工具调用和关键信息
        if (iter.tool_calls) {
          iter.tool_calls.forEach((tool: any) => {
            finding.tools_used.push({
              tool: tool.tool,
              input_summary: tool.input.substring(0, 100) + (tool.input.length > 100 ? '...' : ''),
              output_summary: tool.output ? tool.output.substring(0, 200) + (tool.output.length > 200 ? '...' : '') : '无输出'
            });
            
            // 提取关键信息
            if (tool.output && tool.output.length > 50) {
              finding.key_information.push(`${tool.tool}: ${tool.output.substring(0, 150)}...`);
            }
          });
        }
        
        // 解析记忆块
        if (iter.workspace_state) {
          finding.memory_blocks = parseMemoryBlocks(iter.workspace_state);
        }
        
        findings.push(finding);
      });
      
      return findings;
    };

    // 生成上下文摘要
    const generateContextSummary = (iterations: any[], result: string) => {
      const toolsUsed = new Set();
      const keyTopics = new Set();
      let totalCalls = 0;
      
      iterations.forEach((iter: any) => {
        if (iter.tool_calls) {
          iter.tool_calls.forEach((tool: any) => {
            toolsUsed.add(tool.tool);
            totalCalls++;
            
            // 提取关键词
            if (tool.input) {
              const keywords = tool.input.split(/\s+/).filter((word: string) => word.length > 3);
              keywords.forEach((keyword: string) => keyTopics.add(keyword));
            }
          });
        }
      });
      
      return {
        total_iterations: iterations.length,
        total_tool_calls: totalCalls,
        tools_used: Array.from(toolsUsed),
        key_topics: Array.from(keyTopics).slice(0, 10), // 限制关键词数量
        has_result: !!result,
        result_summary: result ? result.substring(0, 300) + (result.length > 300 ? '...' : '') : '暂无结果'
      };
    };

    const iterations = previousSearchState.iterations || [];
    const previousResult = previousSearchState.result || previousSearchState.answer || previousSearchState.summary || '';
    const keyFindings = extractKeyFindings(iterations);
    const contextSummary = generateContextSummary(iterations, previousResult);

    // 准备增强的搜索历史信息（传递给GitHub Actions）
    const enhancedSearchHistory = {
      // 基础信息
      original_query: previousSearchState.query,
      original_search_id: search_id,
      previous_status: previousSearchState.status,
      total_previous_rounds: iterations.length,
      
      // 上下文摘要
      context_summary: contextSummary,
      
      // 关键发现
      key_findings: keyFindings,
      
      // 完整结果信息
      previous_results: {
        main_result: previousResult,
        has_answer: !!(previousSearchState.answer || previousSearchState.result),
        has_summary: !!previousSearchState.summary,
        status_context: `搜索状态: ${previousSearchState.status}, 完成轮数: ${iterations.length}`
      },
      
      // 继续搜索指令
      continue_instruction: `基于以下已完成的搜索历史，请继续深入搜索并补充遗漏信息：

原始查询: ${previousSearchState.query}
已完成轮数: ${iterations.length}
已使用工具: ${contextSummary.tools_used.join(', ')}
已获得的主要信息: ${contextSummary.result_summary}

请在现有基础上：
1. 补充尚未探索的角度
2. 深入挖掘关键细节
3. 验证和完善已有信息
4. 寻找新的相关线索

避免重复已经完成的工作，专注于扩展和深化搜索结果。`,
      
      // 详细历史（用于必要时的完整恢复）
      detailed_history: iterations.map((iter: any) => ({
        round: iter.round,
        timestamp: iter.timestamp,
        workspace_state: iter.workspace_state,
        tool_calls: iter.tool_calls || [],
        response_json: iter.response_json,
        raw_response: iter.raw_response
      }))
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

    // 更新原有搜索状态为继续搜索模式
    const updatedSearchData = {
      ...previousSearchState,
      status: 'processing' as const,
      updatedAt: new Date().toISOString(),
      is_inline_continuation: true,
      continue_search_requested_at: new Date().toISOString()
    };
    
    // 更新内存中的搜索状态
    memoryStorage.set(`search:${newSearchId}`, updatedSearchData);

    // 优先更新到 Upstash Redis
    try {
      await redisUtils.setSearchData(newSearchId, updatedSearchData);
      console.log(`✅ 搜索状态已更新到Upstash Redis: ${newSearchId}`);
    } catch (redisError) {
      console.warn('⚠️ 更新搜索状态到Upstash Redis失败，尝试Vercel Blob:', redisError);
      
      // 如果 Redis 失败，回退到 Vercel Blob
      try {
        await put(`searches/${newSearchId}.json`, JSON.stringify(updatedSearchData), {
          access: 'public',
          addRandomSuffix: false
        });
        console.log(`✅ 搜索状态已更新到Vercel Blob: ${newSearchId}`);
      } catch (blobError) {
        console.warn('⚠️ 更新搜索状态到Blob也失败:', blobError);
      }
    }

    // 准备继续搜索的数据，使用enhanced_search.yml工作流格式
    // 传递增强的历史信息和智能指令
    const continueSearchData = {
      query: `继续搜索刚才的信息：${previousSearchState.query}`,
      callback_url: getCallbackUrl(request),
      workspace_id: newSearchId,
      search_id: newSearchId,              // 添加必需的search_id字段
      max_rounds: max_rounds,
      include_scraping: true,
      debug_mode: false,
      silent_mode: true,
      // 如果配置了访问密钥，传递给 GitHub Actions 用于回调验证
      access_key: isAccessKeyConfigured() ? extractAccessKeyFromRequest(body) : undefined,
      // 传递增强的搜索历史状态信息
      continue_from_state: JSON.stringify(enhancedSearchHistory)
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
        search_id: newSearchId, // 现在和原始search_id相同
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