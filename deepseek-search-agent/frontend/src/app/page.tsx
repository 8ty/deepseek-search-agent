'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  const [query, setQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!query.trim()) return;

    setIsSubmitting(true);

    try {
      // 生成唯一ID以跟踪此次搜索
      const searchId = uuidv4();

      // 准备回调URL (用于接收GitHub Actions的更新)
      const callbackUrl = `${window.location.origin}/api/webhook?id=${searchId}`;

      // 触发GitHub Actions
      await axios.post('/api/trigger-search', {
        query,
        callbackUrl,
        searchId
      });

      // 跳转到结果页面
      router.push(`/results/${searchId}`);
    } catch (error) {
      console.error('Error triggering search:', error);
      alert('触发搜索失败，请稍后再试');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          DeepSeek 搜索代理
        </h3>
        <div className="mt-2 max-w-xl text-sm text-gray-500">
          <p>
            输入任何问题，让DeepSeek R1模型通过搜索和分析网络内容为您找到答案。
            系统会展示完整的思考过程和迭代步骤。
          </p>
        </div>
        <form onSubmit={handleSubmit} className="mt-5">
          <div className="flex flex-col sm:flex-row">
            <div className="flex-grow">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
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
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    处理中...
                  </>
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