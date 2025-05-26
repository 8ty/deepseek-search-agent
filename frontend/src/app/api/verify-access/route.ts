import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { access_key } = body;
    
    // 获取从Vercel环境变量中设置的访问密钥
    const secretKey = process.env.ACCESS_SECRET_KEY;
    
    if (!secretKey) {
      return NextResponse.json(
        { 
          error: "服务器未配置访问密钥",
          code: "SERVER_NOT_CONFIGURED" 
        },
        { status: 500 }
      );
    }
    
    if (!access_key) {
      return NextResponse.json(
        { 
          error: "请提供访问密钥",
          code: "MISSING_ACCESS_KEY" 
        },
        { status: 400 }
      );
    }
    
    // 简单的密钥比较验证
    const isValid = access_key === secretKey;
    
    if (!isValid) {
      return NextResponse.json(
        { 
          error: "访问密钥无效",
          code: "INVALID_ACCESS_KEY" 
        },
        { status: 403 }
      );
    }
    
    // 验证成功，可以返回一个临时token或简单的成功标识
    const verificationToken = Buffer.from(`verified:${Date.now()}`).toString('base64');
    
    return NextResponse.json({
      status: "verified",
      message: "访问验证成功",
      verification_token: verificationToken,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('访问验证失败:', error);
    return NextResponse.json(
      { 
        error: "验证过程出错",
        code: "VERIFICATION_FAILED"
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "使用 POST 方法进行访问验证",
    required_fields: ["access_key"],
    access_configured: !!process.env.ACCESS_SECRET_KEY
  });
} 