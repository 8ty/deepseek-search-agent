export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">DeepSeek 智能搜索</h1>
          <p className="text-lg text-gray-600">测试页面 - 如果您看到这个文字，说明基本渲染工作正常</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
          <div className="text-center">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">测试成功！</h2>
            <p className="text-gray-600">如果您看到这个卡片，说明 Tailwind CSS 正在工作</p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-100 p-4 rounded-xl">
            <h3 className="font-bold text-blue-800">蓝色卡片</h3>
            <p className="text-blue-600">测试颜色和布局</p>
          </div>
          <div className="bg-purple-100 p-4 rounded-xl">
            <h3 className="font-bold text-purple-800">紫色卡片</h3>
            <p className="text-purple-600">测试网格布局</p>
          </div>
        </div>
      </div>
    </div>
  );
} 