// Netlify函数，用于处理Next.js服务器端渲染和API路由
import { createServerlessHandler } from '@netlify/next';

// 创建一个适配Netlify的Next.js处理程序
const handler = createServerlessHandler({
  // 应用根目录位置，与netlify.toml中的base值保持一致
  dir: '.',
});

export default handler;