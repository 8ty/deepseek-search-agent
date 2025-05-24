'use client';

import { useState, useEffect } from 'react';

interface ConfigStatus {
  environment_configured: boolean;
  github_token_exists: boolean;
  github_repository: string | null;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [showManualConfig, setShowManualConfig] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [githubRepository, setGithubRepository] = useState('');
  const [debugMode, setDebugMode] = useState(false);

  // 从 localStorage 加载设置
  useEffect(() => {
    const savedDebugMode = localStorage.getItem('deepseek-debug-mode');
    if (savedDebugMode === 'true') {
      setDebugMode(true);
    }
  }, []);

  // 保存 debug 模式设置到 localStorage
  const handleDebugModeChange = (enabled: boolean) => {
    setDebugMode(enabled);
    localStorage.setItem('deepseek-debug-mode', enabled.toString());
  };

  // 检查配置状态
  useEffect(() => {
    fetch('/api/trigger-search')
      .then(response => response.json())
      .then(data => setConfigStatus(data))
      .catch(console.error);
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const searchData: any = {
        query: query.trim(),
        max_rounds: 5,
        include_scraping: true,
        debug_mode: debugMode // 传递debug模式状态
      };

      // 如果环境变量未配置且用户提供了手动配置
      if (!configStatus?.environment_configured && githubToken && githubRepository) {
        searchData.github_config = {
          token: githubToken,
          repository: githubRepository,
          force_trigger: true
        };
      }

      const response = await fetch('/api/trigger-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchData),
      });

      const result = await response.json();
      
      if (response.ok) {
        // 跳转到结果页面，包含workspace_id参数
        window.location.href = `/results/${result.search_id}?workspace_id=${result.workspace_id}`;
      } else {
        alert(`搜索失败: ${result.error}`);
      }
    } catch (error) {
      console.error('搜索出错:', error);
      alert('搜索请求失败');
    } finally {
      setIsSearching(false);
    }
  };

  const exampleQueries = [
    "如何使用 React 18 的新特性？",
    "Python 数据分析的最佳实践",
    "Docker 容器化部署指南",
    "JavaScript 性能优化技巧"
  ];

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
        
        {/* 标题区域 */}
        <div className="text-center mb-8" 
             style={{ 
               textAlign: 'center', 
               marginBottom: '32px' 
             }}>
          <h1 className="text-4xl font-bold text-gray-900 mb-4" 
              style={{ 
                fontSize: '2.25rem', 
                fontWeight: 'bold', 
                color: '#111827', 
                marginBottom: '16px' 
              }}>
            DeepSeek 智能搜索
          </h1>
          <p className="text-lg text-gray-600 mb-6" 
             style={{ 
               fontSize: '1.125rem', 
               color: '#4b5563',
               marginBottom: '24px'
             }}>
            使用 DeepSeek R1 模型进行深度推理和智能搜索
          </p>

          {/* 配置状态指示器 */}
          {configStatus && (
            <div className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium"
                 style={{
                   display: 'inline-flex',
                   alignItems: 'center',
                   padding: '8px 16px',
                   borderRadius: '9999px',
                   fontSize: '0.875rem',
                   fontWeight: '500',
                   backgroundColor: configStatus.environment_configured ? '#dcfce7' : '#fef3c7',
                   color: configStatus.environment_configured ? '#166534' : '#92400e'
                 }}>
              <span style={{ marginRight: '8px' }}>
                {configStatus.environment_configured ? '✅' : '⚠️'}
              </span>
              {configStatus.environment_configured 
                ? '环境变量已配置，自动启用 GitHub Actions'
                : '需要手动配置 GitHub 信息'
              }
            </div>
          )}
        </div>

        {/* 搜索卡片 */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 mb-8"
             style={{
               background: 'white',
               borderRadius: '16px',
               boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
               border: '1px solid #e5e7eb',
               padding: '32px',
               marginBottom: '32px'
             }}>
          
          {/* 搜索输入区域 */}
          <div className="mb-6" style={{ marginBottom: '24px' }}>
            <textarea
              value={query}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQuery(e.target.value)}
              placeholder="请输入您的问题或搜索查询..."
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '12px',
                resize: 'none',
                minHeight: '120px',
                fontSize: '16px',
                lineHeight: '1.5'
              }}
              rows={4}
              disabled={isSearching}
            />
          </div>

          {/* 手动配置区域 */}
          {configStatus && !configStatus.environment_configured && (
            <div className="mb-6" style={{ marginBottom: '24px' }}>
              <button
                onClick={() => setShowManualConfig(!showManualConfig)}
                className="text-blue-600 hover:text-blue-800 font-medium mb-4"
                style={{
                  color: '#2563eb',
                  fontWeight: '500',
                  marginBottom: '16px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {showManualConfig ? '隐藏' : '显示'} GitHub 配置选项
              </button>

              {showManualConfig && (
                <div className="space-y-4 p-4 bg-gray-50 rounded-xl"
                     style={{
                       background: '#f9fafb',
                       borderRadius: '12px',
                       padding: '16px'
                     }}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2"
                           style={{
                             display: 'block',
                             fontSize: '0.875rem',
                             fontWeight: '500',
                             color: '#374151',
                             marginBottom: '8px'
                           }}>
                      GitHub Token
                    </label>
                    <input
                      type="password"
                      value={githubToken}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGithubToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxx"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px'
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2"
                           style={{
                             display: 'block',
                             fontSize: '0.875rem',
                             fontWeight: '500',
                             color: '#374151',
                             marginBottom: '8px'
                           }}>
                      GitHub Repository
                    </label>
                    <input
                      type="text"
                      value={githubRepository}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGithubRepository(e.target.value)}
                      placeholder="username/repository"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Debug 模式开关 */}
          <div className="mb-4 flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
               style={{
                 marginBottom: '16px',
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'space-between',
                 padding: '12px',
                 backgroundColor: '#f9fafb',
                 borderRadius: '8px',
                 border: '1px solid #e5e7eb'
               }}>
            <div>
              <label className="text-sm font-medium text-gray-700"
                     style={{
                       fontSize: '0.875rem',
                       fontWeight: '500',
                       color: '#374151'
                     }}>
                🐛 调试模式
              </label>
              <p className="text-xs text-gray-500 mt-1"
                 style={{
                   fontSize: '0.75rem',
                   color: '#6b7280',
                   marginTop: '4px'
                 }}>
                {debugMode ? '已启用详细日志输出' : '启用后显示搜索过程的详细信息'}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only"
                checked={debugMode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleDebugModeChange(e.target.checked)}
              />
              <div
                className={`w-11 h-6 rounded-full shadow-inner transition-colors ${
                  debugMode ? 'bg-blue-500' : 'bg-gray-300'
                }`}
                style={{
                  width: '44px',
                  height: '24px',
                  borderRadius: '12px',
                  backgroundColor: debugMode ? '#3b82f6' : '#d1d5db',
                  transition: 'background-color 0.2s'
                }}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                    debugMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                  style={{
                    width: '16px',
                    height: '16px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                    transform: debugMode ? 'translateX(20px)' : 'translateX(4px)',
                    transition: 'transform 0.2s',
                    marginTop: '4px'
                  }}
                />
              </div>
            </label>
          </div>

          {/* 搜索按钮 */}
          <button
            onClick={handleSearch}
            disabled={!query.trim() || isSearching}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-4 px-6 rounded-xl transition-colors"
            style={{
              width: '100%',
              backgroundColor: (!query.trim() || isSearching) ? '#9ca3af' : '#2563eb',
              color: 'white',
              fontWeight: '600',
              padding: '16px 24px',
              borderRadius: '12px',
              border: 'none',
              cursor: (!query.trim() || isSearching) ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s'
            }}
          >
            {isSearching ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ marginRight: '8px' }}>🔍</span>
                搜索中...
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ marginRight: '8px' }}>🚀</span>
                开始智能搜索
              </span>
            )}
          </button>
        </div>

        {/* 示例查询 */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
             style={{
               background: 'white',
               borderRadius: '16px',
               boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
               border: '1px solid #e5e7eb',
               padding: '24px'
             }}>
          <h2 className="text-xl font-semibold text-gray-800 mb-4"
              style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#1f2937',
                marginBottom: '16px'
              }}>
            💡 示例查询
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3"
               style={{
                 display: 'grid',
                 gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                 gap: '12px'
               }}>
            {exampleQueries.map((example, index) => (
              <button
                key={index}
                onClick={() => setQuery(example)}
                className="text-left p-3 rounded-lg bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 transition-colors"
                style={{
                  textAlign: 'left',
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.currentTarget.style.backgroundColor = '#eff6ff';
                  e.currentTarget.style.borderColor = '#93c5fd';
                }}
                onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
              >
                <span className="text-gray-700 text-sm"
                      style={{
                        color: '#374151',
                        fontSize: '0.875rem'
                      }}>
                  {example}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 