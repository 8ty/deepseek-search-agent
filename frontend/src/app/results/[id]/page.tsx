'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

// 定义搜索状态类型
type SearchStatus = 'pending' | 'processing' | 'completed' | 'failed';

// 定义迭代数据类型
interface Iteration {
  round: number;
  timestamp: string;
  workspace_state: string;
  tool_calls: Array<{
    tool: string;
    input: string;
    output?: string;
  }>;
}

// 定义搜索数据类型
interface SearchData {
  status: SearchStatus;
  query: string;
  createdAt: string;
  iterations: Iteration[];
  result: string | null;
  error?: string;
}

export default function ResultPage() {
  const { id } = useParams() as { id: string };
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace_id');
  
  const [searchData, setSearchData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [activeIteration, setActiveIteration] = useState<number | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  // 从 localStorage 加载 debug 模式设置
  useEffect(() => {
    const savedDebugMode = localStorage.getItem('deepseek-debug-mode');
    if (savedDebugMode === 'true') {
      setDebugMode(true);
    }
  }, []);

  const logDebugInfo = (info: any) => {
    if (debugMode) {
      const timestamp = new Date().toISOString();
      setDebugInfo(prev => ({
        ...prev,
        [`${timestamp}`]: info
      }));
      console.log('[DEBUG]', timestamp, info);
    }
  };

  // 获取搜索状态
  const fetchSearchStatus = async () => {
    try {
      // 构建请求URL，包含 workspace_id（如果有的话）
      let url = `/api/search-status/${id}`;
      if (workspaceId) {
        url += `?workspace_id=${workspaceId}`;
      }

      logDebugInfo({
        action: 'fetch_status',
        url,
        searchId: id,
        workspaceId
      });

      const response = await axios.get(url);
      
      logDebugInfo({
        action: 'status_response',
        status: response.status,
        data: response.data
      });

      setSearchData(response.data);

      // 如果搜索已完成或失败，停止轮询
      if (response.data.status === 'completed' || response.data.status === 'failed') {
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      }

      setLoading(false);
    } catch (err: any) {
      logDebugInfo({
        action: 'fetch_error',
        error: {
          message: err.message,
          response: err.response?.data,
          status: err.response?.status
        }
      });

      setError(err.response?.data?.error || '获取搜索状态失败');
      setLoading(false);

      // 如果发生错误，也停止轮询
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    }
  };

  // 在组件挂载时获取初始状态并设置轮询
  useEffect(() => {
    fetchSearchStatus();

    // 每5秒轮询一次，直到搜索完成
    const interval = setInterval(fetchSearchStatus, 5000);
    setPollingInterval(interval);

    // 组件卸载时清除轮询
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [id, workspaceId]); // 添加 workspaceId 依赖

  // 渲染状态标签
  const renderStatusBadge = (status: SearchStatus) => {
    const statusMap = {
      pending: { text: '等待中', color: 'bg-gray-500' },
      processing: { text: '处理中', color: 'bg-blue-500 animate-pulse' },
      completed: { text: '已完成', color: 'bg-green-500' },
      failed: { text: '失败', color: 'bg-red-500' }
    };

    const { text, color } = statusMap[status] || statusMap.pending;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${color}`}>
        {text}
      </span>
    );
  };

  // 解析并渲染记忆块
  const renderMemoryBlocks = (workspaceState: string) => {
    // 提取状态
    const statusMatch = workspaceState.match(/Status: (.+)/);
    const status = statusMatch ? statusMatch[1] : 'Unknown';

    // 提取记忆块
    const blocks: Array<{ id: string, content: string }> = [];
    const blockRegex = /<([a-z]+-\d+)>(.+?)<\/\1>/gs;
    let match;

    while ((match = blockRegex.exec(workspaceState)) !== null) {
      blocks.push({
        id: match[1],
        content: match[2]
      });
    }

    return (
      <div className="space-y-3">
        <div className="font-medium">状态: {status}</div>
        <div className="font-medium">记忆块:</div>
        {blocks.length === 0 ? (
          <div className="text-gray-500">无记忆块</div>
        ) : (
          blocks.map((block) => (
            <div key={block.id} className="memory-block">
              <div className="memory-block-id mb-1">{block.id}</div>
              <div>{block.content}</div>
            </div>
          ))
        )}
      </div>
    );
  };

  // 渲染工具调用
  const renderToolCalls = (toolCalls: Iteration['tool_calls']) => {
    return (
      <div className="space-y-4 mt-4">
        <div className="font-medium">工具调用:</div>
        {toolCalls.map((call, index) => (
          <div key={index} className="tool-call">
            <div className="font-medium">{call.tool}: {call.input}</div>
            {call.output && (
              <div className="tool-result mt-2">
                <div className="text-sm text-gray-500 mb-1">结果:</div>
                <div className="whitespace-pre-wrap text-sm">{call.output}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // 如果正在加载
  if (loading) {
    return (
      <div className="bg-white shadow sm:rounded-lg p-6">
        <div className="flex justify-center items-center h-60">
          <div className="text-center">
            <div className="spinner mb-4 flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
            <h3 className="text-lg font-medium text-gray-900">正在加载搜索结果...</h3>
          </div>
        </div>
      </div>
    );
  }

  // 如果发生错误
  if (error) {
    return (
      <div className="bg-white shadow sm:rounded-lg p-6">
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">出现错误</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 如果数据不存在
  if (!searchData) {
    return (
      <div className="bg-white shadow sm:rounded-lg p-6">
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900">未找到搜索数据</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow sm:rounded-lg p-6">
      {/* Debug 信息面板 */}
      {debugMode && (
        <div className="mb-6 p-4 bg-gray-100 rounded-lg">
          <div className="flex justify-between items-start mb-2">
            <h4 className="text-sm font-medium text-gray-700">🐛 Debug 信息</h4>
            <button
              onClick={() => {
                const debugData = {
                  searchId: id,
                  workspaceId,
                  searchData,
                  debugLogs: debugInfo
                };
                navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
                alert('Debug 信息已复制到剪贴板');
              }}
              className="text-xs text-indigo-600 hover:text-indigo-500"
            >
              📋 复制 Debug 信息
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <strong>Search ID:</strong> {id}
            </div>
            <div>
              <strong>Workspace ID:</strong> {workspaceId || '未设置'}
            </div>
          </div>
          {debugInfo && (
            <div className="mt-2">
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-600">查看详细日志</summary>
                <pre className="mt-2 text-gray-600 overflow-auto max-h-40 bg-white p-2 rounded">
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}

      {/* 搜索信息头部 */}
      <div className="border-b pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              搜索查询
            </h2>
            <p className="text-gray-700">{searchData?.query}</p>
            <div className="mt-2">
              {searchData && renderStatusBadge(searchData.status)}
              <span className="text-sm text-gray-500 ml-2">
                {searchData?.createdAt && new Date(searchData.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 如果搜索已完成且有结果 */}
      {searchData.status === 'completed' && searchData.result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-medium text-green-800 mb-2">最终结果</h3>
          <div className="prose max-w-none">
            <ReactMarkdown>{searchData.result}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* 如果搜索失败 */}
      {searchData.status === 'failed' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-medium text-red-800">搜索失败</h3>
          <p className="text-red-700">{searchData.error || '未知错误'}</p>
        </div>
      )}

      {/* 迭代过程 */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">思考过程</h3>

        {searchData.status === 'processing' && (
          <div className="mb-4 flex items-center">
            <div className="thinking-animation mr-3">思考中</div>
            <div className="text-sm text-gray-500">
              已完成 {searchData.iterations.length} 轮迭代
            </div>
          </div>
        )}

        {/* 迭代列表 */}
        {searchData.iterations.length === 0 ? (
          <div className="text-gray-500">尚无迭代数据</div>
        ) : (
          <div className="space-y-6">
            {searchData.iterations.map((iteration, index) => (
              <div key={index} className="border rounded-lg overflow-hidden">
                <div
                  className="p-4 bg-gray-50 border-b cursor-pointer flex justify-between items-center"
                  onClick={() => setActiveIteration(activeIteration === index ? null : index)}
                >
                  <h4 className="font-medium">
                    第{iteration.round}轮迭代
                    <span className="text-sm text-gray-500 ml-2">
                      {new Date(iteration.timestamp).toLocaleString()}
                    </span>
                  </h4>
                  <svg
                    className={`h-5 w-5 transform ${activeIteration === index ? 'rotate-180' : ''}`}
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>

                {activeIteration === index && (
                  <div className="p-4">
                    {/* 工作区状态 */}
                    <div className="mb-6">
                      {renderMemoryBlocks(iteration.workspace_state)}
                    </div>

                    {/* 工具调用 */}
                    {iteration.tool_calls.length > 0 && (
                      renderToolCalls(iteration.tool_calls)
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}