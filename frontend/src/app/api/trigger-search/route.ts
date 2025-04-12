import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: Request) {
  try {
    const { query, callbackUrl, searchId } = await request.json();

    if (!query || !callbackUrl || !searchId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // 获取GitHub仓库信息和令牌
    const repo = process.env.REPOSITORY; // 格式: owner/repo
    const token = process.env.GITHUB_TOKEN;

    if (!repo || !token) {
      return NextResponse.json(
        { error: 'Missing repository configuration' },
        { status: 500 }
      );
    }

    // 触发GitHub Actions工作流
    const response = await axios({
      method: 'POST',
      url: `https://api.github.com/repos/${repo}/dispatches`,
      headers: {
        'Accept': 'application/vnd.github.everest-preview+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        event_type: 'search-request',
        client_payload: {
          query,
          callback_url: callbackUrl
        }
      }
    });

    // 将搜索信息存储到数据库或缓存中
    // 在生产环境中，你应该使用数据库或Redis等存储搜索状态
    // 这里我们简化实现，仅作演示

    return NextResponse.json({
      success: true,
      searchId,
      message: 'Search request triggered'
    });
  } catch (error) {
    console.error('Error triggering GitHub Actions:', error);

    return NextResponse.json(
      { error: 'Failed to trigger search' },
      { status: 500 }
    );
  }
}