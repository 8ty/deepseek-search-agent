import { NextResponse } from 'next/server';
import { redisUtils, redis } from '../../../lib/upstash';

export async function GET() {
  try {
    // 测试基本连接
    const testKey = `test-${Date.now()}`;
    const testValue = { message: 'Hello Upstash Redis!', timestamp: new Date().toISOString() };
    
    // 写入测试数据
    await redisUtils.setSearchData(testKey, testValue);
    console.log(`✅ 写入测试数据成功: ${testKey}`);
    
    // 读取测试数据
    const retrievedValue = await redisUtils.getSearchData(testKey);
    console.log(`✅ 读取测试数据成功: ${JSON.stringify(retrievedValue)}`);
    
    // 清理测试数据
    await redisUtils.deleteSearchData(testKey);
    console.log(`✅ 清理测试数据成功: ${testKey}`);
    
    // 获取 Redis 信息
    const info = await redis.ping();
    
    return NextResponse.json({
      status: 'success',
      message: 'Upstash Redis 连接测试成功',
      test_results: {
        write_test: '✅ 写入成功',
        read_test: '✅ 读取成功',
        delete_test: '✅ 删除成功',
        ping_result: info,
        test_data: retrievedValue
      },
      environment: {
        has_kv_url: !!process.env.KV_REST_API_URL,
        has_kv_token: !!process.env.KV_REST_API_TOKEN,
        has_upstash_url: !!process.env.UPSTASH_REDIS_REST_URL,
        has_upstash_token: !!process.env.UPSTASH_REDIS_REST_TOKEN
      }
    });
    
  } catch (error) {
    console.error('❌ Redis 连接测试失败:', error);
    
    return NextResponse.json({
      status: 'error',
      message: 'Upstash Redis 连接测试失败',
      error: error instanceof Error ? error.message : String(error),
      environment: {
        has_kv_url: !!process.env.KV_REST_API_URL,
        has_kv_token: !!process.env.KV_REST_API_TOKEN,
        has_upstash_url: !!process.env.UPSTASH_REDIS_REST_URL,
        has_upstash_token: !!process.env.UPSTASH_REDIS_REST_TOKEN
      }
    }, { status: 500 });
  }
} 