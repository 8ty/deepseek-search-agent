'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// 定义 Debug 信息类型
interface DebugLogEntry {
  action: string;
  [key: string]: any;
}

interface DebugInfo {
  [timestamp: string]: DebugLogEntry;
}

interface ConfigStatus {
  environment_configured: boolean;
  github_token_exists: boolean;
  github_repository: string | null;
  deployment_platform: string;
}

export default function Home() {
  const [query, setQuery] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  
  // GitHub Actions 配置状态
  const [showGitHubConfig, setShowGitHubConfig] = useState<boolean>(false);
  const [githubToken, setGithubToken] = useState<string>('');
  const [githubRepository, setGithubRepository] = useState<string>('');
  const [enableGitHubActions, setEnableGitHubActions] = useState<boolean>(false);
  
  // 环境变量配置状态
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [configLoading, setConfigLoading] = useState<boolean>(true);
  
  const router = useRouter();

  // 检查环境变量配置
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await axios.get('/api/check-config');
        setConfigStatus(response.data);
        
        // 如果环境变量已配置，自动启用GitHub Actions
        if (response.data.environment_configured) {
          setEnableGitHubActions(true);
        }
        
        setConfigLoading(false);
      } catch (error) {
        console.error('检查配置失败:', error);
        setConfigLoading(false);
      }
    };
    
    checkConfig();
  }, []);

  // 从 localStorage 加载 debug 模式设置
  useEffect(() => {
    const savedDebugMode = localStorage.getItem('deepseek-debug-mode');
    if (savedDebugMode === 'true') {
      setDebugMode(true);
    }
  }, []);

  // 保存 debug 模式设置
  const toggleDebugMode = () => {
    const newDebugMode = !debugMode;
    setDebugMode(newDebugMode);
    localStorage.setItem('deepseek-debug-mode', newDebugMode.toString());
    if (!newDebugMode) {
      setDebugInfo(null);
    }
  };

  const logDebugInfo = (info: DebugLogEntry) => {
    if (debugMode) {
      const timestamp = new Date().toISOString();
      setDebugInfo((prev: DebugInfo | null) => ({
        ...(prev || {}),
        [`${timestamp}`]: info
      }));
      console.log('[DEBUG]', timestamp, info);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!query.trim()) return;

    setIsSubmitting(true);
    setDebugInfo(null);

    try {
      // 生成唯一ID以跟踪此次搜索
      const searchId = uuidv4();
      const workspaceId = uuidv4();
      
      logDebugInfo({
        action: 'search_start',
        searchId,
        workspaceId,
        query: query.trim()
      });

      // 准备回调URL
      const callbackUrl = `${window.location.origin}/api/webhook?id=${searchId}`;

      // 准备请求数据
      const requestData = {
        query: query.trim(),
        workspace_id: workspaceId,
        search_id: searchId,
        callback_url: callbackUrl,
        max_rounds: 5,
        include_scraping: true,
        // 只有在需要手动配置且用户启用时才发送GitHub配置
        github_config: (!configStatus?.environment_configured && enableGitHubActions) ? {
          token: githubToken,
          repository: githubRepository,
          force_trigger: true
        } : null
      };

      logDebugInfo({
        action: 'api_request',
        url: '/api/trigger-search',
        data: requestData
      });

      // 触发搜索
      const response = await axios.post('/api/trigger-search', requestData);

      logDebugInfo({
        action: 'api_response',
        status: response.status,
        data: response.data
      });

      // 跳转到结果页面
      router.push(`/results/${searchId}?workspace_id=${workspaceId}`);
    } catch (error: any) {
      console.error('Error triggering search:', error);
      
      logDebugInfo({
        action: 'error',
        error: {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status
        }
      });

      let errorMessage = '触发搜索失败，请稍后再试';
      if (error.response?.data?.error) {
        errorMessage = `错误: ${error.response.data.error}`;
      }
      
      alert(errorMessage);
      setIsSubmitting(false);
    }
  };

  const renderConfigStatus = () => {
    if (configLoading) {
      return (
        <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-sm text-gray-600">检查配置状态...</span>
          </div>
        </div>
      );
    }

    if (configStatus?.environment_configured) {
      return (
        <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-green-800">✅ 环境配置完成</h4>
              <p className="text-xs text-green-700 mt-1">
                已检测到Vercel环境变量配置，搜索功能已自动启用
                {configStatus.github_repository && (
                  <span className="block">仓库: {configStatus.github_repository}</span>
                )}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-4 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h4 className="text-sm font-medium text-yellow-800">⚠️ 需要手动配置</h4>
            <p className="text-xs text-yellow-700 mt-1">
              未检测到环境变量配置，需要手动输入GitHub信息来启用真实搜索功能
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* 头部 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-3">
              <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">DeepSeek 智能搜索</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            基于 DeepSeek R1 模型的智能搜索代理，为您提供深度思考和精准答案
          </p>
        </div>

        {/* 主搜索卡片 */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-6">
            {/* Debug 模式开关 */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                <div className="text-xs px-3 py-1 bg-blue-100 text-blue-600 rounded-full font-medium">
                  AI 搜索引擎
                </div>
                <div className="text-xs px-3 py-1 bg-purple-100 text-purple-600 rounded-full font-medium">
                  DeepSeek R1
                </div>
              </div>
              <label className="flex items-center text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={debugMode}
                  onChange={toggleDebugMode}
                  className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded transition-colors"
                />
                Debug 模式
              </label>
            </div>

            {/* 配置状态 */}
            {renderConfigStatus()}

            {/* 搜索表单 */}
            <form onSubmit={handleSubmit} className="mt-6">
              <div className="relative">
                <textarea
                  value={query}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQuery(e.target.value)}
                  className="w-full p-4 text-gray-900 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all duration-200"
                  placeholder="例如：帮我找出2024年最受欢迎的三款轻量级浏览器，并比较它们的特点和性能..."
                  rows={4}
                  disabled={isSubmitting}
                  required
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !query.trim()}
                  className={`absolute bottom-3 right-3 inline-flex items-center px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isSubmitting || !query.trim()
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      分析中...
                    </>
                  ) : (
                    <>
                      <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      开始搜索
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Debug 信息面板 */}
            {debugMode && debugInfo && (
              <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-700">🐛 Debug 信息</h4>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
                      alert('Debug 信息已复制到剪贴板');
                    }}
                    className="text-xs text-blue-600 hover:text-blue-500 font-medium"
                  >
                    📋 复制
                  </button>
                </div>
                <pre className="text-xs text-gray-600 overflow-auto max-h-40 bg-white p-3 rounded border">
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </div>
            )}

            {/* GitHub Actions 手动配置面板 */}
            {!configStatus?.environment_configured && (
              <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-blue-800">⚡ GitHub Actions 配置</h4>
                  <button
                    onClick={() => setShowGitHubConfig(!showGitHubConfig)}
                    className="text-xs text-blue-600 hover:text-blue-500 font-medium"
                  >
                    {showGitHubConfig ? '隐藏配置' : '显示配置'}
                  </button>
                </div>
                
                <div className="flex items-center mb-3">
                  <input
                    type="checkbox"
                    checked={enableGitHubActions}
                    onChange={(e) => setEnableGitHubActions(e.target.checked)}
                    className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label className="text-sm text-blue-700">
                    启用 GitHub Actions（触发真实搜索）
                  </label>
                </div>

                {showGitHubConfig && enableGitHubActions && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        GitHub Token:
                      </label>
                      <input
                        type="password"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                        className="w-full text-xs p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Repository (用户名/仓库名):
                      </label>
                      <input
                        type="text"
                        value={githubRepository}
                        onChange={(e) => setGithubRepository(e.target.value)}
                        placeholder="username/deepseek-search-agent"
                        className="w-full text-xs p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="text-xs text-gray-600 bg-white p-3 rounded border">
                      💡 提示：需要有仓库的 Actions 权限才能触发 GitHub Actions
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 示例查询 */}
        <div className="mt-8">
          <h4 className="text-lg font-semibold text-gray-900 mb-4 text-center">💡 试试这些查询</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setQuery("帮我找出Windows端三款轻量级浏览器，轻量级是指占用低，内存小，加载快，比较一下各自的优缺点。")}
              className="p-4 text-left bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-200 group"
            >
              <div className="flex items-start">
                <div className="bg-blue-100 rounded-lg p-2 mr-3">
                  <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h5 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">轻量级浏览器对比</h5>
                  <p className="text-sm text-gray-600 mt-1">比较三款轻量级浏览器的优缺点</p>
                </div>
              </div>
            </button>
            
            <button
              onClick={() => setQuery("创业公司如何在没有大量预算的情况下进行有效的营销？列出5种可行的策略。")}
              className="p-4 text-left bg-white rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-lg transition-all duration-200 group"
            >
              <div className="flex items-start">
                <div className="bg-purple-100 rounded-lg p-2 mr-3">
                  <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <h5 className="font-medium text-gray-900 group-hover:text-purple-600 transition-colors">创业营销策略</h5>
                  <p className="text-sm text-gray-600 mt-1">创业公司的低成本营销策略</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}