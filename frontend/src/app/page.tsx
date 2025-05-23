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

export default function Home() {
  const [query, setQuery] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const router = useRouter();

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
      const workspaceId = uuidv4(); // 生成工作空间ID
      
      logDebugInfo({
        action: 'search_start',
        searchId,
        workspaceId,
        query: query.trim()
      });

      // 准备回调URL (用于接收GitHub Actions的更新)
      const callbackUrl = `${window.location.origin}/api/webhook?id=${searchId}`;

      // 准备请求数据（使用新架构的参数格式）
      const requestData = {
        query: query.trim(),
        workspace_id: workspaceId,
        search_id: searchId, // 保持向后兼容
        callback_url: callbackUrl,
        max_rounds: 5,
        include_scraping: true
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

      // 跳转到结果页面，传递 workspace_id
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

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        {/* Debug 模式开关 */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            DeepSeek 搜索代理
          </h3>
          <div className="flex items-center">
            <label className="flex items-center text-sm text-gray-600">
              <input
                type="checkbox"
                checked={debugMode}
                onChange={toggleDebugMode}
                className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              Debug 模式
            </label>
          </div>
        </div>

        <div className="mt-2 max-w-xl text-sm text-gray-500">
          <p>
            输入任何问题，让DeepSeek R1模型通过搜索和分析网络内容为您找到答案。
            系统会展示完整的思考过程和迭代步骤。
          </p>
        </div>

        {/* Debug 信息面板 */}
        {debugMode && debugInfo && (
          <div className="mt-4 p-4 bg-gray-100 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">🐛 Debug 信息：</h4>
            <pre className="text-xs text-gray-600 overflow-auto max-h-40">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
                alert('Debug 信息已复制到剪贴板');
              }}
              className="mt-2 text-xs text-indigo-600 hover:text-indigo-500"
            >
              📋 复制 Debug 信息
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5">
          <div className="flex flex-col sm:flex-row">
            <div className="flex-grow">
              <textarea
                value={query}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQuery(e.target.value)}
                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="例如: 帮我找出2023年最受欢迎的三款轻量级浏览器，并比较它们的特点和性能"
                rows={4}
                disabled={isSubmitting}
                required
              />
            </div>
            <div className="mt-3 sm:mt-0 sm:ml-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className={`inline-flex items-center justify-center h-12 px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white ${isSubmitting
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                  }`}
              >
                {isSubmitting ? (
                  <React.Fragment>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    处理中...
                  </React.Fragment>
                ) : (
                  '开始搜索'
                )}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-5">
          <h4 className="text-md font-medium text-gray-700">最近示例：</h4>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              className="p-3 border rounded cursor-pointer hover:bg-gray-50"
              onClick={() => setQuery("帮我找出windows端三款轻量级浏览器，轻量级是指占用低，内存小，加载快，比较一下各自的优缺点。")}
            >
              比较三款轻量级浏览器的优缺点
            </div>
            <div
              className="p-3 border rounded cursor-pointer hover:bg-gray-50"
              onClick={() => setQuery("创业公司如何在没有大量预算的情况下进行有效的营销？列出5种可行的策略。")}
            >
              创业公司的低成本营销策略
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}