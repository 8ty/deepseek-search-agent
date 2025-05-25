import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // 检查环境变量配置
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepository = process.env.GITHUB_REPOSITORY;
    const hasUpstashUrl = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
    const hasUpstashToken = !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);
    
    // 系统状态
    const systemStatus = {
      github_actions: {
        configured: !!(githubToken && githubRepository),
        token_exists: !!githubToken,
        repository_set: !!githubRepository,
        repository: githubRepository || null,
        status: (!githubToken || !githubRepository) ? 'not_configured' : 'configured'
      },
      upstash_redis: {
        configured: !!(hasUpstashUrl && hasUpstashToken),
        url_exists: hasUpstashUrl,
        token_exists: hasUpstashToken,
        status: (!hasUpstashUrl || !hasUpstashToken) ? 'not_configured' : 'configured'
      },
      features: {
        real_search: !!(githubToken && githubRepository),
        continue_search: !!(githubToken && githubRepository),
        finalize_search: !!(githubToken && githubRepository),
        persistent_storage: !!(hasUpstashUrl && hasUpstashToken)
      }
    };

    // 配置建议
    const suggestions = [];
    
    if (!systemStatus.github_actions.configured) {
      suggestions.push({
        type: 'github_actions',
        issue: 'GitHub Actions 未配置',
        solution: '在 Vercel 环境变量中设置 GITHUB_TOKEN 和 GITHUB_REPOSITORY',
        impact: '无法进行真实搜索、继续搜索和生成最终结果',
        priority: 'high'
      });
    }
    
    if (!systemStatus.upstash_redis.configured) {
      suggestions.push({
        type: 'upstash_redis',
        issue: 'Upstash Redis 未配置',
        solution: '通过 Vercel Marketplace 安装 Upstash Redis 集成',
        impact: '搜索结果只能临时存储，页面刷新后可能丢失',
        priority: 'medium'
      });
    }

    const response = {
      status: 'success',
      timestamp: new Date().toISOString(),
      system: systemStatus,
      suggestions: suggestions,
      overall_health: {
        status: systemStatus.github_actions.configured ? 'healthy' : 'limited',
        message: systemStatus.github_actions.configured 
          ? '🟢 系统完全配置，所有功能可用'
          : '🟡 基础功能可用，高级功能需要配置 GitHub Actions'
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('系统状态检查失败:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: '系统状态检查失败',
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 