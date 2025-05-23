'use client';

export default function Home() {
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
        <div className="text-center mb-8" 
             style={{ 
               textAlign: 'center', 
               marginBottom: '32px' 
             }}>
          <h1 className="text-3xl font-bold text-gray-900 mb-2" 
              style={{ 
                fontSize: '1.875rem', 
                fontWeight: 'bold', 
                color: '#111827', 
                marginBottom: '8px' 
              }}>
            DeepSeek 智能搜索
          </h1>
          <p className="text-lg text-gray-600" 
             style={{ 
               fontSize: '1.125rem', 
               color: '#4b5563' 
             }}>
            测试页面 - 现在应该看到渐变背景和卡片样式
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6"
             style={{
               background: 'white',
               borderRadius: '16px',
               boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
               border: '1px solid #e5e7eb',
               padding: '24px'
             }}>
          <div className="text-center" style={{ textAlign: 'center' }}>
            <div className="text-6xl mb-4" 
                 style={{ 
                   fontSize: '3.75rem', 
                   marginBottom: '16px' 
                 }}>🔍</div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2" 
                style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '600', 
                  color: '#1f2937', 
                  marginBottom: '8px' 
                }}>
              测试成功！
            </h2>
            <p className="text-gray-600" style={{ color: '#4b5563' }}>
              如果您看到渐变背景和卡片阴影，说明样式正在工作
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4"
             style={{
               marginTop: '32px',
               display: 'grid',
               gridTemplateColumns: '1fr',
               gap: '16px'
             }}>
          <div className="bg-blue-100 p-4 rounded-xl"
               style={{
                 background: '#dbeafe',
                 padding: '16px',
                 borderRadius: '12px'
               }}>
            <h3 className="font-bold text-blue-800" 
                style={{ 
                  fontWeight: 'bold', 
                  color: '#1e40af' 
                }}>蓝色卡片</h3>
            <p className="text-blue-600" 
               style={{ 
                 color: '#2563eb' 
               }}>测试颜色和布局</p>
          </div>
          <div className="bg-purple-100 p-4 rounded-xl"
               style={{
                 background: '#faf5ff',
                 padding: '16px',
                 borderRadius: '12px'
               }}>
            <h3 className="font-bold text-purple-800" 
                style={{ 
                  fontWeight: 'bold', 
                  color: '#6b21a8' 
                }}>紫色卡片</h3>
            <p className="text-purple-600" 
               style={{ 
                 color: '#9333ea' 
               }}>测试网格布局</p>
          </div>
        </div>
      </div>
    </div>
  );
} 