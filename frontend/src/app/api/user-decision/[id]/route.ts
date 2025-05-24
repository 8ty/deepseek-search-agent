import { NextRequest, NextResponse } from 'next/server';

// 临时存储用户决策的内存映射
// 生产环境中应该使用Redis或数据库
const userDecisions = new Map<string, string>();

// GET: 获取用户决策
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { error: "缺少搜索ID" },
        { status: 400 }
      );
    }

    // 检查是否有用户决策
    const decision = userDecisions.get(id);
    
    if (decision) {
      // 消费后删除决策（避免重复处理）
      userDecisions.delete(id);
      console.log(`✅ 返回用户决策: ${id} -> ${decision}`);
      
      return NextResponse.json({ 
        action: decision 
      });
    }
    
    // 没有决策时返回null
    return NextResponse.json({ 
      action: null 
    });

  } catch (error) {
    console.error('GET用户决策错误:', error);
    return NextResponse.json(
      { 
        error: "获取用户决策失败",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// POST: 设置用户决策
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { error: "缺少搜索ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action } = body;
    
    if (!action) {
      return NextResponse.json(
        { error: "缺少action参数" },
        { status: 400 }
      );
    }

    // 验证action值
    if (!['continue', 'finalize'].includes(action)) {
      return NextResponse.json(
        { error: "无效的action值，应为'continue'或'finalize'" },
        { status: 400 }
      );
    }

    // 存储用户决策
    userDecisions.set(id, action);
    console.log(`📝 设置用户决策: ${id} -> ${action}`);
    
    // 设置决策过期（5分钟后自动清理）
    setTimeout(() => {
      if (userDecisions.has(id)) {
        userDecisions.delete(id);
        console.log(`🗑️ 清理过期用户决策: ${id}`);
      }
    }, 5 * 60 * 1000);

    return NextResponse.json({ 
      success: true,
      message: `用户决策已设置: ${action}`,
      search_id: id,
      action: action,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('POST用户决策错误:', error);
    return NextResponse.json(
      { 
        error: "设置用户决策失败",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// OPTIONS: 支持CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
} 