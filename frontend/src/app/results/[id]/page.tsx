'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

// 定义搜索状态类型
type SearchStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'running' | 'timeout' | 'error' | 'waiting_user_decision';

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

// 定义 GitHub Actions 状态类型
interface GitHubActionRun {
  id: number;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
  workflow_name: string;
  display_title: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  head_commit: {
    message: string;
    timestamp: string;
  };
  event: string;
  actor: string;
}

interface GitHubActionsStatus {
  configured: boolean;
  repository?: string;
  runs?: GitHubActionRun[];
  summary?: {
    recent_runs: number;
    running: number;
    completed: number;
    success: number;
    failed: number;
  };
  error?: string;
}

// 超时处理器组件
interface TimeoutHandlerProps {
  searchData: SearchData;
  searchId: string;
  workspaceId: string | null;
  onContinueSearch: () => void;
}

const TimeoutHandler: React.FC<TimeoutHandlerProps> = ({
  searchData,
  searchId,
  workspaceId,
  onContinueSearch
}) => {
  const [isRequesting, setIsRequesting] = useState(false);
  const [actionType, setActionType] = useState<'continue' | 'finalize' | null>(null);
  const [isWaitingDecision, setIsWaitingDecision] = useState(false);

  useEffect(() => {
    // 检查是否处于等待用户决策状态
    if (searchData.status === 'waiting_user_decision') {
      setIsWaitingDecision(true);
    } else {
      setIsWaitingDecision(false);
    }
  }, [searchData.status]);

  const sendUserDecision = async (action: 'continue' | 'finalize') => {
    try {
      setIsRequesting(true);
      setActionType(action);

      const response = await fetch(`/api/user-decision/${searchId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ action })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ 用户决策已发送:', result);
        
        setIsWaitingDecision(false);
        // 立即开始轮询状态更新
        onContinueSearch();
      } else {
        const error = await response.json();
        console.error('❌ 发送用户决策失败:', error);
        alert(`发送决策失败: ${error.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('❌ 用户决策请求失败:', error);
      alert('发送决策请求失败，请稍后重试');
    } finally {
      setIsRequesting(false);
      setActionType(null);
    }
  };

  const handleContinueSearch = async () => {
    if (isWaitingDecision) {
      // 如果是等待决策状态，发送用户决策
      await sendUserDecision('continue');
    } else {
      // 原有的继续搜索逻辑（用于向后兼容）
      setIsRequesting(true);
      setActionType('continue');

      try {
        // 发送继续搜索请求
        const response = await fetch('/api/continue-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            search_id: searchId,
            max_rounds: 3 // 额外的迭代次数
          }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log('继续搜索响应:', result);
          
          // 如果有新的搜索ID，跳转到新的结果页面
          if (result.search_id && result.redirect_url) {
            window.location.href = result.redirect_url;
          } else if (result.search_id) {
            window.location.href = `/results/${result.search_id}`;
          } else {
            // 降级处理：重新加载当前页面
            onContinueSearch();
          }
        } else {
          const errorData = await response.json();
          alert(`继续搜索失败：${errorData.error || '请稍后重试'}`);
        }
      } catch (error) {
        console.error('继续搜索请求失败:', error);
        alert('继续搜索请求失败');
      } finally {
        setIsRequesting(false);
        setActionType(null);
      }
    }
  };

  const handleFinalizeResult = async () => {
    if (isWaitingDecision) {
      // 如果是等待决策状态，发送用户决策
      await sendUserDecision('finalize');
    } else {
      // 原有的最终化结果逻辑（用于向后兼容）
      setIsRequesting(true);
      setActionType('finalize');

      try {
        // 发送根据当前信息生成最终结果的请求
        const response = await fetch('/api/finalize-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            search_id: searchId
          }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log('生成最终结果响应:', result);
          
          // 如果有新的搜索ID，跳转到新的结果页面
          if (result.search_id && result.redirect_url) {
            window.location.href = result.redirect_url;
          } else if (result.search_id) {
            window.location.href = `/results/${result.search_id}`;
          } else {
            // 降级处理：重新加载当前页面
            onContinueSearch();
          }
        } else {
          const errorData = await response.json();
          alert(`生成最终结果失败：${errorData.error || '请稍后重试'}`);
        }
      } catch (error) {
        console.error('生成最终结果请求失败:', error);
        alert('生成最终结果请求失败');
      } finally {
        setIsRequesting(false);
        setActionType(null);
      }
    }
  };

  // 如果是等待用户决策状态，显示不同的界面
  if (isWaitingDecision) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6"
           style={{
             backgroundColor: '#eff6ff',
             border: '1px solid #3b82f6',
             borderRadius: '12px',
             padding: '24px',
             marginBottom: '24px'
           }}>
        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            <svg className="h-6 w-6 text-blue-600"
                 style={{ width: '24px', height: '24px', color: '#2563eb' }}
                 fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-blue-800 mb-2"
                style={{
                  fontSize: '1.125rem',
                  fontWeight: '500',
                  color: '#1e40af',
                  marginBottom: '8px'
                }}>
              🤔 搜索代理正在等待您的指示
            </h3>
            <p className="text-blue-700 mb-4"
               style={{ color: '#1d4ed8', marginBottom: '16px' }}>
              搜索已完成初始轮次，代理正在等待您的决策。请选择下一步操作：
            </p>

            <div className="bg-blue-100 rounded-lg p-3 mb-4"
                 style={{
                   backgroundColor: '#dbeafe',
                   borderRadius: '8px',
                   padding: '12px',
                   marginBottom: '16px'
                 }}>
              <p className="text-blue-800 text-sm"
                 style={{ color: '#1e40af', fontSize: '0.875rem' }}>
                <strong>💡 提示：</strong> 搜索代理在同一个环境中等待您的指示，这样可以保持所有搜索状态和上下文。
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3"
                 style={{
                   display: 'flex',
                   flexDirection: 'column',
                   gap: '12px'
                 }}>

              {/* 继续搜索按钮 */}
              <button
                onClick={handleContinueSearch}
                disabled={isRequesting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center"
                style={{
                  flex: 1,
                  backgroundColor: isRequesting && actionType === 'continue' ? '#9ca3af' : '#2563eb',
                  color: 'white',
                  fontWeight: '500',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: (isRequesting && actionType === 'continue') ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {isRequesting && actionType === 'continue' ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                         style={{ animation: 'spin 1s linear infinite', marginLeft: '-4px', marginRight: '8px', width: '16px', height: '16px' }}
                         xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    发送指令中...
                  </>
                ) : (
                  '🔄 继续深入搜索'
                )}
              </button>

              {/* 生成最终结果按钮 */}
              <button
                onClick={handleFinalizeResult}
                disabled={isRequesting}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center"
                style={{
                  flex: 1,
                  backgroundColor: isRequesting && actionType === 'finalize' ? '#9ca3af' : '#16a34a',
                  color: 'white',
                  fontWeight: '500',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: (isRequesting && actionType === 'finalize') ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {isRequesting && actionType === 'finalize' ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                         style={{ animation: 'spin 1s linear infinite', marginLeft: '-4px', marginRight: '8px', width: '16px', height: '16px' }}
                         xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    发送指令中...
                  </>
                ) : (
                  '📝 基于现有信息生成结果'
                )}
              </button>
            </div>

            <div className="mt-4 text-sm text-blue-600"
                 style={{ marginTop: '16px', fontSize: '0.875rem', color: '#2563eb' }}>
              ⏰ 代理将在5分钟后自动选择生成最终结果
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 原有的timeout状态界面
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6"
         style={{
           backgroundColor: '#fefce8',
           border: '1px solid #fde047',
           borderRadius: '12px',
           padding: '24px',
           marginBottom: '24px'
         }}>
      <div className="flex items-start space-x-4">
        <div className="flex-shrink-0">
          <svg className="h-6 w-6 text-yellow-600"
               style={{ width: '24px', height: '24px', color: '#d97706' }}
               fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.96-.833-2.73 0L4.084 15.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-medium text-yellow-800 mb-2"
              style={{
                fontSize: '1.125rem',
                fontWeight: '500',
                color: '#92400e',
                marginBottom: '8px'
              }}>
            搜索达到最大迭代次数
          </h3>
          <p className="text-yellow-700 mb-4"
             style={{ color: '#a16207', marginBottom: '16px' }}>
            搜索已达到设定的最大轮次限制，系统已自动基于收集的信息生成最终结果。如需获取更多详细信息，可选择继续搜索。
          </p>

          {searchData.summary && (
            <div className="bg-yellow-100 rounded-lg p-3 mb-4"
                 style={{
                   backgroundColor: '#fef3c7',
                   borderRadius: '8px',
                   padding: '12px',
                   marginBottom: '16px'
                 }}>
              <p className="text-yellow-800 text-sm"
                 style={{ color: '#92400e', fontSize: '0.875rem' }}>
                <strong>搜索总结：</strong> {searchData.summary}
              </p>
            </div>
          )}

          {/* 自动生成结果的提示 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4"
               style={{
                 backgroundColor: '#eff6ff',
                 border: '1px solid #bfdbfe',
                 borderRadius: '8px',
                 padding: '12px',
                 marginBottom: '16px'
               }}>
            <p className="text-blue-800 text-sm"
               style={{ color: '#1e40af', fontSize: '0.875rem' }}>
              <strong>💡 提示：</strong> 系统已自动基于收集的信息生成最终结果。如需获取更多详细信息，可继续深入搜索。
            </p>
          </div>

          <div className="space-y-3" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            <div className="flex justify-center"
                 style={{
                   display: 'flex',
                   justifyContent: 'center'
                 }}>

              {/* 只保留继续搜索按钮 */}
              <button
                onClick={handleContinueSearch}
                disabled={isRequesting}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center justify-center"
                style={{
                  backgroundColor: isRequesting ? '#9ca3af' : '#2563eb',
                  color: 'white',
                  fontWeight: '500',
                  padding: '8px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: isRequesting ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {isRequesting && actionType === 'continue' ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                         style={{ animation: 'spin 1s linear infinite', marginLeft: '-4px', marginRight: '8px', width: '16px', height: '16px' }}
                         xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    继续搜索中...
                  </>
                ) : (
                  '🔄 继续深入搜索'
                )}
              </button>
            </div>

            <p className="text-xs text-yellow-600 text-center"
               style={{ fontSize: '0.75rem', color: '#ca8a04', textAlign: 'center' }}>
              💡 系统已自动基于当前信息生成结果，继续搜索将获取更多详细信息。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// GitHub Actions 状态显示组件
interface GitHubActionsStatusPanelProps {
  searchId: string;
}

const GitHubActionsStatusPanel: React.FC<GitHubActionsStatusPanelProps> = ({ searchId }) => {
  const [actionsStatus, setActionsStatus] = useState<GitHubActionsStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [expanded, setExpanded] = useState<boolean>(false);

  // 获取 GitHub Actions 状态
  const fetchActionsStatus = async () => {
    try {
      const response = await fetch(`/api/github-actions-status/${searchId}`);
      const data = await response.json();
      setActionsStatus(data);
      setLoading(false);
    } catch (error) {
      console.error('获取 GitHub Actions 状态失败:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActionsStatus();
    
    // 每30秒轮询一次状态更新
    const interval = setInterval(fetchActionsStatus, 30000);
    
    return () => clearInterval(interval);
  }, [searchId]);

  // 渲染运行状态标签
  const renderStatusBadge = (status: string, conclusion: string | null) => {
    if (status === 'in_progress') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          运行中
        </span>
      );
    } else if (status === 'completed') {
      const colorMap = {
        success: 'bg-green-100 text-green-800',
        failure: 'bg-red-100 text-red-800',
        cancelled: 'bg-gray-100 text-gray-800',
        neutral: 'bg-yellow-100 text-yellow-800',
        skipped: 'bg-gray-100 text-gray-800',
        timed_out: 'bg-orange-100 text-orange-800',
        action_required: 'bg-purple-100 text-purple-800'
      };
      const color = colorMap[conclusion as keyof typeof colorMap] || 'bg-gray-100 text-gray-800';
      const text = {
        success: '✅ 成功',
        failure: '❌ 失败', 
        cancelled: '⏹️ 取消',
        neutral: '⚪ 中性',
        skipped: '⏭️ 跳过',
        timed_out: '⏰ 超时',
        action_required: '🔔 需要操作'
      };
      
      return (
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${color}`}>
          {text[conclusion as keyof typeof text] || conclusion}
        </span>
      );
    } else if (status === 'queued') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          ⏳ 队列中
        </span>
      );
    }
    
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex items-center">
          <svg className="animate-spin h-4 w-4 text-gray-600 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-sm text-gray-600">正在获取 GitHub Actions 状态...</span>
        </div>
      </div>
    );
  }

  if (!actionsStatus?.configured) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <div className="flex items-start">
          <svg className="h-5 w-5 text-yellow-400 mt-0.5 mr-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <h4 className="text-sm font-medium text-yellow-800">GitHub Actions 未配置</h4>
            <p className="text-sm text-yellow-700 mt-1">
              需要配置 GITHUB_TOKEN 和 GITHUB_REPOSITORY 环境变量才能显示工作流状态
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (actionsStatus?.error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div className="flex items-start">
          <svg className="h-5 w-5 text-red-400 mt-0.5 mr-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div>
            <h4 className="text-sm font-medium text-red-800">GitHub Actions 状态获取失败</h4>
            <p className="text-sm text-red-700 mt-1">{actionsStatus.error}</p>
          </div>
        </div>
      </div>
    );
  }

  const summary = actionsStatus?.summary;
  const runs = actionsStatus?.runs || [];

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <svg className="h-5 w-5 text-blue-600 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h4 className="text-sm font-medium text-blue-800">GitHub Actions 状态</h4>
          <span className="text-xs text-blue-600 ml-2">({actionsStatus?.repository})</span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-blue-600 hover:text-blue-500 text-sm"
        >
          {expanded ? '收起' : '展开'}
        </button>
      </div>

      {summary && (
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="flex items-center text-sm">
            <span className="text-blue-700">最近运行:</span>
            <span className="ml-1 font-medium text-blue-800">{summary.recent_runs}</span>
          </div>
          {summary.running > 0 && (
            <div className="flex items-center text-sm">
              <span className="text-blue-700">运行中:</span>
              <span className="ml-1 font-medium text-blue-800">{summary.running}</span>
            </div>
          )}
          <div className="flex items-center text-sm">
            <span className="text-green-700">成功:</span>
            <span className="ml-1 font-medium text-green-800">{summary.success}</span>
          </div>
          {summary.failed > 0 && (
            <div className="flex items-center text-sm">
              <span className="text-red-700">失败:</span>
              <span className="ml-1 font-medium text-red-800">{summary.failed}</span>
            </div>
          )}
        </div>
      )}

      {expanded && runs.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="text-sm font-medium text-blue-800">最近的工作流运行:</div>
          {runs.slice(0, 5).map((run) => (
            <div key={run.id} className="bg-white rounded-lg border border-blue-200 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {renderStatusBadge(run.status, run.conclusion)}
                  <span className="text-sm font-medium text-gray-900">{run.workflow_name}</span>
                </div>
                <a
                  href={run.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-500 text-xs"
                >
                  查看详情 →
                </a>
              </div>
              <div className="mt-2 text-xs text-gray-600">
                <div>触发事件: {run.event}</div>
                <div>开始时间: {new Date(run.created_at).toLocaleString()}</div>
                {run.head_commit?.message && (
                  <div className="mt-1 truncate">提交: {run.head_commit.message}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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
      timeout: { text: '超时', color: 'bg-yellow-500' },
      waiting_user_decision: { text: '等待决策', color: 'bg-blue-600' }
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
                               status === 'timeout' ? '#eab308' :
                               status === 'waiting_user_decision' ? '#2563eb' : '#ef4444'
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

          {/* GitHub Actions 状态面板 */}
          <GitHubActionsStatusPanel searchId={id} />

          {/* 如果搜索已完成或超时但有结果 */}
          {((searchData.status === 'completed') || 
            (searchData.status === 'timeout' && (searchData.answer || searchData.results?.answer || searchData.result || searchData.summary))) && 
           (searchData.answer || searchData.results?.answer || searchData.result || searchData.summary) && (
            <div className={`border rounded-lg p-4 mb-6 ${
              searchData.status === 'completed' 
                ? 'bg-green-50 border-green-200' 
                : 'bg-amber-50 border-amber-200'
            }`}
                 style={{
                   backgroundColor: searchData.status === 'completed' ? '#f0fdf4' : '#fffbeb',
                   border: searchData.status === 'completed' ? '1px solid #bbf7d0' : '1px solid #fed7aa',
                   borderRadius: '8px',
                   padding: '16px',
                   marginBottom: '24px'
                 }}>
              <h3 className={`text-lg font-medium mb-2 ${
                searchData.status === 'completed' ? 'text-green-800' : 'text-amber-800'
              }`}
                  style={{
                    fontSize: '1.125rem',
                    fontWeight: '500',
                    color: searchData.status === 'completed' ? '#166534' : '#92400e',
                    marginBottom: '8px'
                  }}>
                {searchData.status === 'completed' ? '🎉 最终结果' : '📋 基于已收集信息的结果'}
              </h3>
              {searchData.status === 'timeout' && (
                <div className="text-amber-700 text-sm mb-3 p-2 bg-amber-100 rounded"
                     style={{
                       color: '#b45309',
                       fontSize: '0.875rem',
                       marginBottom: '12px',
                       padding: '8px',
                       backgroundColor: '#fef3c7',
                       borderRadius: '6px'
                     }}>
                  💡 搜索达到最大轮数限制，以下是基于已收集信息生成的结果：
                </div>
              )}
              <div className="prose max-w-none"
                   style={{
                     maxWidth: 'none',
                     color: searchData.status === 'completed' ? '#166534' : '#92400e'
                   }}>
                <ReactMarkdown>
                  {searchData.answer || searchData.results?.answer || searchData.result || searchData.summary || '暂无结果'}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* 如果搜索超时且没有显示结果，显示超时处理器 */}
          {searchData.status === 'timeout' && 
           !(searchData.answer || searchData.results?.answer || searchData.result || searchData.summary) && (
            <TimeoutHandler
              searchData={searchData}
              searchId={id}
              workspaceId={workspaceId}
              onContinueSearch={() => {
                // 重新触发搜索
                window.location.reload();
              }}
            />
          )}

          {/* 如果搜索超时但有结果，显示继续搜索选项 */}
          {searchData.status === 'timeout' && 
           (searchData.answer || searchData.results?.answer || searchData.result || searchData.summary) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6"
                 style={{
                   backgroundColor: '#eff6ff',
                   border: '1px solid #bfdbfe',
                   borderRadius: '8px',
                   padding: '16px',
                   marginBottom: '24px'
                 }}>
              <div className="flex items-start" style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div className="flex-shrink-0" style={{ flexShrink: 0 }}>
                  <svg className="h-5 w-5 text-blue-400" 
                       style={{ width: '20px', height: '20px', color: '#60a5fa' }}
                       xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3" style={{ marginLeft: '12px', flex: 1 }}>
                  <h3 className="text-lg font-medium text-blue-800 mb-2"
                      style={{
                        fontSize: '1.125rem',
                        fontWeight: '500',
                        color: '#1e40af',
                        marginBottom: '8px'
                      }}>
                    🔍 需要更详细的信息？
                  </h3>
                  <p className="text-blue-700 mb-4"
                     style={{ color: '#1d4ed8', marginBottom: '16px' }}>
                    已基于收集的信息生成了结果。如需获取更详细的信息，可以继续深入搜索。
                  </p>
                                     <button
                     onClick={async () => {
                       try {
                         const response = await fetch('/api/continue-search', {
                           method: 'POST',
                           headers: { 'Content-Type': 'application/json' },
                           body: JSON.stringify({ search_id: id, max_rounds: 3 }),
                         });
                         
                         if (response.ok) {
                           const result = await response.json();
                           if (result.redirect_url) {
                             window.location.href = result.redirect_url;
                           }
                         } else {
                           const errorData = await response.json();
                           console.error('继续搜索失败:', errorData);
                           
                           // 显示友好的错误信息
                           let errorMessage = `❌ ${errorData.error || '继续搜索失败'}\n\n`;
                           
                           if (errorData.details) {
                             if (errorData.details.suggestion) {
                               errorMessage += `💡 ${errorData.details.suggestion}\n\n`;
                             }
                             if (errorData.details.status) {
                               errorMessage += `🔍 错误详情：HTTP ${errorData.details.status} ${errorData.details.statusText || ''}\n`;
                             }
                             if (errorData.details.githubError) {
                               errorMessage += `📝 GitHub 响应：${errorData.details.githubError}\n\n`;
                             }
                           }
                           
                           errorMessage += `⏰ 当前可以查看已收集的信息。`;
                           alert(errorMessage);
                         }
                       } catch (error) {
                         console.error('继续搜索请求失败:', error);
                         alert('❌ 网络请求失败，请检查网络连接后重试。');
                       }
                     }}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
                    style={{
                      backgroundColor: '#2563eb',
                      color: 'white',
                      fontWeight: '500',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#1d4ed8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#2563eb';
                    }}
                  >
                    🔄 继续深入搜索
                  </button>
                </div>
              </div>
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

          {/* 原始记录 */}
          {searchData.status === 'completed' && (searchData.iterations || []).length > 0 && (
            <div className="mb-6">
              <details className="bg-gray-50 border border-gray-200 rounded-lg p-4"
                       style={{
                         backgroundColor: '#f9fafb',
                         border: '1px solid #e5e7eb',
                         borderRadius: '8px',
                         padding: '16px',
                         marginBottom: '24px'
                       }}>
                <summary className="cursor-pointer text-lg font-medium text-gray-900 mb-2"
                         style={{
                           cursor: 'pointer',
                           fontSize: '1.125rem',
                           fontWeight: '500',
                           color: '#111827',
                           marginBottom: '8px'
                         }}>📋 原始记录（点击展开）</summary>
                <div className="mt-4 space-y-4"
                     style={{
                       marginTop: '16px',
                       display: 'flex',
                       flexDirection: 'column',
                       gap: '16px'
                     }}>
                  {(searchData.iterations || []).map((iteration: Iteration, index: number) => (
                    <div key={index} className="bg-white border rounded-lg p-3"
                         style={{
                           backgroundColor: 'white',
                           border: '1px solid #d1d5db',
                           borderRadius: '8px',
                           padding: '12px'
                         }}>
                      <div className="text-sm font-medium text-gray-700 mb-2"
                           style={{
                             fontSize: '0.875rem',
                             fontWeight: '500',
                             color: '#374151',
                             marginBottom: '8px'
                           }}>
                        第{iteration.round}轮 - {new Date(iteration.timestamp).toLocaleString()}
                      </div>

                      {/* 工作区状态原始内容 */}
                      <div className="mb-3">
                        <div className="text-xs font-medium text-gray-600 mb-1"
                             style={{
                               fontSize: '0.75rem',
                               fontWeight: '500',
                               color: '#4b5563',
                               marginBottom: '4px'
                             }}>工作区状态:</div>
                        <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32"
                             style={{
                               fontSize: '0.75rem',
                               backgroundColor: '#f3f4f6',
                               padding: '8px',
                               borderRadius: '4px',
                               overflow: 'auto',
                               maxHeight: '128px',
                               whiteSpace: 'pre-wrap'
                             }}>
                          {iteration.workspace_state}
                        </pre>
                      </div>

                      {/* 工具调用原始内容 */}
                      {iteration.tool_calls && iteration.tool_calls.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs font-medium text-gray-600 mb-1"
                               style={{
                                 fontSize: '0.75rem',
                                 fontWeight: '500',
                                 color: '#4b5563',
                                 marginBottom: '4px'
                               }}>工具调用:</div>
                          <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32"
                               style={{
                                 fontSize: '0.75rem',
                                 backgroundColor: '#f3f4f6',
                                 padding: '8px',
                                 borderRadius: '4px',
                                 overflow: 'auto',
                                 maxHeight: '128px',
                                 whiteSpace: 'pre-wrap'
                               }}>
                            {JSON.stringify(iteration.tool_calls, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* 原始响应 */}
                      {iteration.raw_response && (
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1"
                               style={{
                                 fontSize: '0.75rem',
                                 fontWeight: '500',
                                 color: '#4b5563',
                                 marginBottom: '4px'
                               }}>原始响应:</div>
                          <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32"
                               style={{
                                 fontSize: '0.75rem',
                                 backgroundColor: '#f3f4f6',
                                 padding: '8px',
                                 borderRadius: '4px',
                                 overflow: 'auto',
                                 maxHeight: '128px',
                                 whiteSpace: 'pre-wrap'
                               }}>
                            {iteration.raw_response}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
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