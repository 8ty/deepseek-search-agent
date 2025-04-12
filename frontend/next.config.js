/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Cloudflare Pages 支持配置
  // 参考: https://developers.cloudflare.com/pages/framework-guides/deploy-a-nextjs-site/
  experimental: {
    // 如果部署到Cloudflare Pages，启用以下配置
    // isrMemoryCacheSize: 0, // 禁用内存缓存，使用Cloudflare全局缓存
  },
  // 在Edge运行时运行会更好地支持Cloudflare网络
  // 如果开启此功能，请确保你的API路由兼容Edge运行时
  // output: 'standalone', // 针对Vercel
  // 如果部署到Cloudflare Pages，取消注释下一行
  // output: 'export', // 针对Cloudflare Pages静态导出

  // 根据环境自动选择输出模式
  // 当部署到不同平台时，通过环境变量调整配置
  // process.env.DEPLOYMENT_PLATFORM 可以在部署平台的环境变量中设置
  output: process.env.DEPLOYMENT_PLATFORM === 'cloudflare' ? 'export' : 'standalone',
};

module.exports = nextConfig;