'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

// 定义搜索状态类型
type SearchStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'running' | 'timeout' | 'error';

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
  response_json?: any;
  raw_response?: string;
}

// 定义搜索数据类型
interface SearchData {
  search_id?: string;
  status: SearchStatus;
  query: string;
  createdAt: string;
  updatedAt?: string;
  iterations?: Iteration[];
  result?: string | null;
  answer?: string;
  error?: string;
  total_rounds?: number;
  message?: string;
  summary?: string;
  final_state?: string;
  traceback?: string;
  results?: {
    answer?: string;
    iterations?: Iteration[];
    total_rounds?: number;
    completedAt?: string;
    status?: string;
    message?: string;
    summary?: string;
    final_state?: string;
    error?: string;
    traceback?: string;
  };
}

// 定义 Debug 信息类型
interface DebugLogEntry {
  action: string;
  [key: string]: any;
}

interface DebugInfo {
  [timestamp: string]: DebugLogEntry;
}

export default function ResultPage() {
  const { id } = useParams() as { id: string };
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace_id');
  
  const [searchData, setSearchData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [activeIteration, setActiveIteration] = useState<number | null>(null);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);

  // 从 localStorage 加载 debug 模式设置
  useEffect(() => {
    const savedDebugMode = localStorage.getItem('deepseek-debug-mode');
    if (savedDebugMode === 'true') {
      setDebugMode(true);
    }
  }, []);

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
      if (response.data.status === 'completed' || response.data.status === 'failed' || response.data.status === 'error' || response.data.status === 'timeout') {
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
  }, [id, workspaceId]);

  // 渲染状态标签
  const renderStatusBadge = (status: SearchStatus) => {
    const statusMap = {
      pending: { text: '等待中', color: 'bg-gray-500' },
      processing: { text: '处理中', color: 'bg-blue-500 animate-pulse' },
      running: { text: '运行中', color: 'bg-blue-500 animate-pulse' },
      completed: { text: '已完成', color: 'bg-green-500' },
      failed: { text: '失败', color: 'bg-red-500' },
      error: { text: '错误', color: 'bg-red-500' },
      timeout: { text: '超时', color: 'bg-yellow-500' }
    };

    const { text, color } = statusMap[status] || statusMap.pending;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${color}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: '500',
              color: 'white',
              backgroundColor: status === 'pending' ? '#6b7280' :
                               status === 'processing' || status === 'running' ? '#3b82f6' :
                               status === 'completed' ? '#10b981' : 
                               status === 'timeout' ? '#eab308' : '#ef4444'
            }}>
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
      <div className="space-y-3" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="font-medium" style={{ fontWeight: '500' }}>状态: {status}</div>
        <div className="font-medium" style={{ fontWeight: '500' }}>记忆块:</div>
        {blocks.length === 0 ? (
          <div className="text-gray-500" style={{ color: '#6b7280' }}>无记忆块</div>
        ) : (
          blocks.map((block) => (
            <div key={block.id} className="memory-block"
                 style={{
                   padding: '12px',
                   backgroundColor: '#f3f4f6',
                   borderRadius: '8px',
                   border: '1px solid #e5e7eb'
                 }}>
              <div className="memory-block-id mb-1" 
                   style={{ 
                     fontWeight: '600', 
                     color: '#374151', 
                     marginBottom: '4px',
                     fontSize: '0.875rem'
                   }}>{block.id}</div>
              <div style={{ color: '#4b5563' }}>{block.content}</div>
            </div>
          ))
        )}
      </div>
    );
  };

  // 渲染工具调用
  const renderToolCalls = (toolCalls: Iteration['tool_calls']) => {
    return (
      <div className="space-y-4 mt-4" 
           style={{ 
             display: 'flex', 
             flexDirection: 'column', 
             gap: '16px', 
             marginTop: '16px' 
           }}>
        <div className="font-medium" style={{ fontWeight: '500' }}>工具调用:</div>
        {toolCalls.map((call, index) => (
          <div key={index} className="tool-call"
               style={{
                 padding: '16px',
                 backgroundColor: '#fef3c7',
                 borderRadius: '8px',
                 border: '1px solid #fbbf24'
               }}>
            <div className="font-medium" 
                 style={{ 
                   fontWeight: '500', 
                   color: '#92400e' 
                 }}>{call.tool}: {call.input}</div>
            {call.output && (
              <div className="tool-result mt-2" style={{ marginTop: '8px' }}>
                <div className="text-sm text-gray-500 mb-1" 
                     style={{ 
                       fontSize: '0.875rem', 
                       color: '#6b7280', 
                       marginBottom: '4px' 
                     }}>结果:</div>
                <div className="whitespace-pre-wrap text-sm" 
                     style={{ 
                       whiteSpace: 'pre-wrap', 
                       fontSize: '0.875rem',
                       color: '#374151'
                     }}>{call.output}</div>
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50" 
           style={{
             minHeight: '100vh',
             background: 'linear-gradient(135deg, #dbeafe 0%, #ffffff 50%, #faf5ff 100%)'
           }}>
        <div className="max-w-4xl mx-auto px-4 py-8" 
             style={{
               maxWidth: '896px',
               margin: '0 auto',
               padding: '32px 16px'
             }}>
          <div className="bg-white shadow-xl sm:rounded-lg p-6"
               style={{
                 background: 'white',
                 borderRadius: '16px',
                 boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                 padding: '24px'
               }}>
            <div className="flex justify-center items-center h-60"
                 style={{
                   display: 'flex',
                   justifyContent: 'center',
                   alignItems: 'center',
                   height: '240px'
                 }}>
              <div className="text-center" style={{ textAlign: 'center' }}>
                <div className="spinner mb-4 flex justify-center"
                     style={{
                       marginBottom: '16px',
                       display: 'flex',
                       justifyContent: 'center'
                     }}>
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"
                       style={{
                         width: '48px',
                         height: '48px',
                         borderRadius: '50%',
                         border: '2px solid #e5e7eb',
                         borderTopColor: '#6366f1',
                         borderBottomColor: '#6366f1',
                         animation: 'spin 1s linear infinite'
                       }}></div>
                </div>
                <h3 className="text-lg font-medium text-gray-900"
                    style={{
                      fontSize: '1.125rem',
                      fontWeight: '500',
                      color: '#111827'
                    }}>正在加载搜索结果...</h3>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 如果发生错误
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50" 
           style={{
             minHeight: '100vh',
             background: 'linear-gradient(135deg, #dbeafe 0%, #ffffff 50%, #faf5ff 100%)'
           }}>
        <div className="max-w-4xl mx-auto px-4 py-8" 
             style={{
               maxWidth: '896px',
               margin: '0 auto',
               padding: '32px 16px'
             }}>
          <div className="bg-white shadow-xl sm:rounded-lg p-6"
               style={{
                 background: 'white',
                 borderRadius: '16px',
                 boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                 padding: '24px'
               }}>
            <div className="bg-red-50 border-l-4 border-red-400 p-4"
                 style={{
                   backgroundColor: '#fef2f2',
                   borderLeft: '4px solid #f87171',
                   padding: '16px'
                 }}>
              <div className="flex" style={{ display: 'flex' }}>
                <div className="flex-shrink-0" style={{ flexShrink: 0 }}>
                  <svg className="h-5 w-5 text-red-400" 
                       style={{ width: '20px', height: '20px', color: '#f87171' }}
                       xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3" style={{ marginLeft: '12px' }}>
                  <h3 className="text-sm font-medium text-red-800"
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        color: '#991b1b'
                      }}>出现错误</h3>
                  <div className="mt-2 text-sm text-red-700"
                       style={{
                         marginTop: '8px',
                         fontSize: '0.875rem',
                         color: '#b91c1c'
                       }}>{error}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 如果数据不存在
  if (!searchData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50" 
           style={{
             minHeight: '100vh',
             background: 'linear-gradient(135deg, #dbeafe 0%, #ffffff 50%, #faf5ff 100%)'
           }}>
        <div className="max-w-4xl mx-auto px-4 py-8" 
             style={{
               maxWidth: '896px',
               margin: '0 auto',
               padding: '32px 16px'
             }}>
          <div className="bg-white shadow-xl sm:rounded-lg p-6"
               style={{
                 background: 'white',
                 borderRadius: '16px',
                 boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                 padding: '24px'
               }}>
            <div className="text-center py-12" 
                 style={{ 
                   textAlign: 'center', 
                   padding: '48px 0' 
                 }}>
              <h3 className="text-lg font-medium text-gray-900"
                  style={{
                    fontSize: '1.125rem',
                    fontWeight: '500',
                    color: '#111827'
                  }}>未找到搜索数据</h3>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50" 
         style={{
           minHeight: '100vh',
           background: 'linear-gradient(135deg, #dbeafe 0%, #ffffff 50%, #faf5ff 100%)'
         }}>
      <div className="max-w-4xl mx-auto px-4 py-8" 
           style={{
             maxWidth: '896px',
             margin: '0 auto',
             padding: '32px 16px'
           }}>
        <div className="bg-white shadow-xl sm:rounded-lg p-6"
             style={{
               background: 'white',
               borderRadius: '16px',
               boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
               padding: '24px'
             }}>
          
          {/* 返回按钮 */}
          <div className="mb-6" style={{ marginBottom: '24px' }}>
            <button
              onClick={() => window.location.href = '/'}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#374151',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
              }}
            >
              ← 返回搜索
            </button>
          </div>

          {/* Debug 信息面板 */}
          {debugMode && (
            <div className="mb-6 p-4 bg-gray-100 rounded-lg"
                 style={{
                   marginBottom: '24px',
                   padding: '16px',
                   backgroundColor: '#f3f4f6',
                   borderRadius: '8px'
                 }}>
              <div className="flex justify-between items-start mb-2"
                   style={{
                     display: 'flex',
                     justifyContent: 'space-between',
                     alignItems: 'flex-start',
                     marginBottom: '8px'
                   }}>
                <h4 className="text-sm font-medium text-gray-700"
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: '#374151'
                    }}>🐛 Debug 信息</h4>
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
                  style={{
                    fontSize: '0.75rem',
                    color: '#4f46e5',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  📋 复制 Debug 信息
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs"
                   style={{
                     display: 'grid',
                     gridTemplateColumns: '1fr 1fr',
                     gap: '16px',
                     fontSize: '0.75rem'
                   }}>
                <div>
                  <strong>Search ID:</strong> {id}
                </div>
                <div>
                  <strong>Workspace ID:</strong> {workspaceId || '未设置'}
                </div>
              </div>
              {debugInfo && (
                <div className="mt-2" style={{ marginTop: '8px' }}>
                  <details className="text-xs" style={{ fontSize: '0.75rem' }}>
                    <summary className="cursor-pointer text-gray-600"
                             style={{ cursor: 'pointer', color: '#4b5563' }}>查看详细日志</summary>
                    <pre className="mt-2 text-gray-600 overflow-auto max-h-40 bg-white p-2 rounded"
                         style={{
                           marginTop: '8px',
                           color: '#4b5563',
                           overflow: 'auto',
                           maxHeight: '160px',
                           backgroundColor: 'white',
                           padding: '8px',
                           borderRadius: '4px'
                         }}>
                      {JSON.stringify(debugInfo, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          )}

          {/* 搜索信息头部 */}
          <div className="border-b pb-4 mb-6"
               style={{
                 borderBottom: '1px solid #e5e7eb',
                 paddingBottom: '16px',
                 marginBottom: '24px'
               }}>
            <div className="flex justify-between items-start"
                 style={{
                   display: 'flex',
                   justifyContent: 'space-between',
                   alignItems: 'flex-start'
                 }}>
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2"
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 'bold',
                      color: '#111827',
                      marginBottom: '8px'
                    }}>
                  搜索查询
                </h2>
                <p className="text-gray-700" 
                   style={{ color: '#374151' }}>{searchData?.query}</p>
                <div className="mt-2" style={{ marginTop: '8px' }}>
                  {searchData && renderStatusBadge(searchData.status)}
                  <span className="text-sm text-gray-500 ml-2"
                        style={{
                          fontSize: '0.875rem',
                          color: '#6b7280',
                          marginLeft: '8px'
                        }}>
                    {searchData?.createdAt && new Date(searchData.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 如果搜索已完成且有结果 */}
          {searchData.status === 'completed' && (searchData.answer || searchData.results?.answer || searchData.result) && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6"
                 style={{
                   backgroundColor: '#f0fdf4',
                   border: '1px solid #bbf7d0',
                   borderRadius: '8px',
                   padding: '16px',
                   marginBottom: '24px'
                 }}>
              <h3 className="text-lg font-medium text-green-800 mb-2"
                  style={{
                    fontSize: '1.125rem',
                    fontWeight: '500',
                    color: '#166534',
                    marginBottom: '8px'
                  }}>最终结果</h3>
              <div className="prose max-w-none"
                   style={{
                     maxWidth: 'none',
                     color: '#166534'
                   }}>
                <ReactMarkdown>{searchData.answer || searchData.results?.answer || searchData.result || '暂无结果'}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* 如果搜索超时 */}
          {searchData.status === 'timeout' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6"
                 style={{
                   backgroundColor: '#fefce8',
                   border: '1px solid #fde047',
                   borderRadius: '8px',
                   padding: '16px',
                   marginBottom: '24px'
                 }}>
              <h3 className="text-lg font-medium text-yellow-800"
                  style={{
                    fontSize: '1.125rem',
                    fontWeight: '500',
                    color: '#92400e'
                  }}>搜索超时</h3>
              <p className="text-yellow-700" 
                 style={{ color: '#a16207' }}>{searchData.message || '搜索执行超时'}</p>
              {searchData.summary && (
                <div className="mt-2" style={{ marginTop: '8px' }}>
                  <p className="text-yellow-700" style={{ color: '#a16207' }}>{searchData.summary}</p>
                </div>
              )}
            </div>
          )}

          {/* 如果搜索失败 */}
          {(searchData.status === 'failed' || searchData.status === 'error') && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6"
                 style={{
                   backgroundColor: '#fef2f2',
                   border: '1px solid #fecaca',
                   borderRadius: '8px',
                   padding: '16px',
                   marginBottom: '24px'
                 }}>
              <h3 className="text-lg font-medium text-red-800"
                  style={{
                    fontSize: '1.125rem',
                    fontWeight: '500',
                    color: '#991b1b'
                  }}>搜索失败</h3>
              <p className="text-red-700" 
                 style={{ color: '#b91c1c' }}>{searchData.error || '未知错误'}</p>
            </div>
          )}

          {/* 迭代过程 */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4"
                style={{
                  fontSize: '1.125rem',
                  fontWeight: '500',
                  color: '#111827',
                  marginBottom: '16px'
                }}>思考过程</h3>

            {(searchData.status === 'processing' || searchData.status === 'running') && (
              <div className="mb-4 flex items-center"
                   style={{
                     marginBottom: '16px',
                     display: 'flex',
                     alignItems: 'center'
                   }}>
                <div className="thinking-animation mr-3"
                     style={{
                       marginRight: '12px',
                       animation: 'pulse 2s infinite'
                     }}>🤔 思考中</div>
                <div className="text-sm text-gray-500"
                     style={{
                       fontSize: '0.875rem',
                       color: '#6b7280'
                     }}>
                  已完成 {searchData.iterations?.length || 0} 轮迭代
                </div>
              </div>
            )}

            {/* 迭代列表 */}
            {!searchData.iterations || searchData.iterations.length === 0 ? (
              <div className="text-gray-500" 
                   style={{ color: '#6b7280' }}>尚无迭代数据</div>
            ) : (
              <div className="space-y-6" 
                   style={{ 
                     display: 'flex', 
                     flexDirection: 'column', 
                     gap: '24px' 
                   }}>
                {(searchData.iterations || []).map((iteration: Iteration, index: number) => (
                  <div key={index} className="border rounded-lg overflow-hidden"
                       style={{
                         border: '1px solid #e5e7eb',
                         borderRadius: '8px',
                         overflow: 'hidden'
                       }}>
                    <div
                      className="p-4 bg-gray-50 border-b cursor-pointer flex justify-between items-center"
                      style={{
                        padding: '16px',
                        backgroundColor: '#f9fafb',
                        borderBottom: '1px solid #e5e7eb',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onClick={() => setActiveIteration(activeIteration === index ? null : index)}
                    >
                      <h4 className="font-medium" style={{ fontWeight: '500' }}>
                        第{iteration.round}轮迭代
                        <span className="text-sm text-gray-500 ml-2"
                              style={{
                                fontSize: '0.875rem',
                                color: '#6b7280',
                                marginLeft: '8px'
                              }}>
                          {new Date(iteration.timestamp).toLocaleString()}
                        </span>
                      </h4>
                      <svg
                        className={`h-5 w-5 transform ${activeIteration === index ? 'rotate-180' : ''}`}
                        style={{
                          width: '20px',
                          height: '20px',
                          transform: activeIteration === index ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.2s'
                        }}
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>

                    {activeIteration === index && (
                      <div className="p-4" style={{ padding: '16px' }}>
                        {/* 工作区状态 */}
                        <div className="mb-6" style={{ marginBottom: '24px' }}>
                          {renderMemoryBlocks(iteration.workspace_state)}
                        </div>

                        {/* 工具调用 */}
                        {iteration.tool_calls && iteration.tool_calls.length > 0 && (
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
      </div>
    </div>
  );
}