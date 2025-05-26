/**
 * 访问权限控制工具
 */

// 验证访问密钥
export function verifyAccessKey(providedKey: string): boolean {
  const secretKey = process.env.ACCESS_SECRET_KEY;
  
  if (!secretKey) {
    console.warn('❌ ACCESS_SECRET_KEY 环境变量未配置');
    return false;
  }
  
  return providedKey === secretKey;
}

// 检查是否已配置访问密钥
export function isAccessKeyConfigured(): boolean {
  return !!process.env.ACCESS_SECRET_KEY;
}

// 从请求中提取访问密钥
export function extractAccessKeyFromRequest(body: any): string | null {
  return body.access_key || body.accessKey || null;
}

// 生成访问密钥错误响应
export function createAccessKeyErrorResponse() {
  return {
    error: "访问被拒绝",
    code: "ACCESS_DENIED",
    message: "请提供正确的访问密钥"
  };
}

// 生成配置缺失错误响应
export function createConfigMissingResponse() {
  return {
    error: "访问密钥未配置",
    code: "ACCESS_KEY_NOT_CONFIGURED",
    message: "管理员尚未配置访问密钥"
  };
} 