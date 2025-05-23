import { NextResponse } from 'next/server';

export async function GET() {
  // 检查环境变量配置状态
  const githubTokenExists = !!process.env.GITHUB_TOKEN;
  const githubRepository = process.env.GITHUB_REPOSITORY;
  const envConfigured = githubTokenExists && !!githubRepository;
  
  return NextResponse.json({
    environment_configured: envConfigured,
    github_token_exists: githubTokenExists,
    github_repository: githubRepository || null,
    deployment_platform: process.env.VERCEL ? 'vercel' : 'other'
  });
} 