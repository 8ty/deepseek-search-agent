import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const searchId = params.id;
    
    // 获取GitHub配置
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepository = process.env.GITHUB_REPOSITORY;
    
    if (!githubToken || !githubRepository) {
      return NextResponse.json(
        { 
          error: "GitHub Actions 未配置",
          configured: false
        },
        { status: 200 }
      );
    }

    // 获取仓库的工作流运行记录
    const response = await fetch(
      `https://api.github.com/repos/${githubRepository}/actions/runs?per_page=50`,
      {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub API 获取工作流失败:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      
      return NextResponse.json(
        {
          error: "无法获取 GitHub Actions 状态",
          details: {
            status: response.status,
            statusText: response.statusText,
            githubError: errorText
          }
        },
        { status: 500 }
      );
    }

    const data = await response.json();
    
    // 查找与搜索ID相关的工作流运行
    // 搜索包含搜索ID的工作流运行（通过 head_commit.message 或其他方式）
    const relatedRuns = data.workflow_runs.filter((run: any) => {
      // 检查提交消息、分支名或者工作流名称是否包含搜索ID
      return run.head_commit?.message?.includes(searchId) ||
             run.head_branch?.includes(searchId) ||
             run.display_title?.includes(searchId) ||
             // 检查工作流文件是否是搜索相关的
             run.workflow?.name?.includes('search') ||
             run.workflow?.path?.includes('search');
    });

    // 如果没有找到相关的，返回最近的搜索相关工作流
    let targetRuns = relatedRuns;
    if (targetRuns.length === 0) {
      targetRuns = data.workflow_runs.filter((run: any) => 
        run.workflow?.name?.includes('search') ||
        run.workflow?.path?.includes('search') ||
        run.event === 'repository_dispatch'
      ).slice(0, 5); // 最近5个
    }

    // 格式化运行状态信息
    const formattedRuns = targetRuns.map((run: any) => ({
      id: run.id,
      status: run.status, // queued, in_progress, completed
      conclusion: run.conclusion, // success, failure, neutral, cancelled, skipped, timed_out, action_required
      workflow_name: run.workflow?.name || 'Unknown Workflow',
      display_title: run.display_title,
      created_at: run.created_at,
      updated_at: run.updated_at,
      html_url: run.html_url,
      head_commit: {
        message: run.head_commit?.message,
        timestamp: run.head_commit?.timestamp
      },
      event: run.event,
      actor: run.actor?.login
    }));

    return NextResponse.json({
      searchId,
      repository: githubRepository,
      configured: true,
      runs: formattedRuns,
      total_count: data.total_count,
      summary: {
        recent_runs: formattedRuns.length,
        running: formattedRuns.filter(r => r.status === 'in_progress').length,
        completed: formattedRuns.filter(r => r.status === 'completed').length,
        success: formattedRuns.filter(r => r.conclusion === 'success').length,
        failed: formattedRuns.filter(r => r.conclusion === 'failure').length
      }
    });

  } catch (error) {
    console.error('获取 GitHub Actions 状态失败:', error);
    return NextResponse.json(
      {
        error: "服务器内部错误",
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 