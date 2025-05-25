import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// 存储键的命名约定
export const REDIS_KEYS = {
  search: (id: string) => `search:${id}`,
  searchList: () => 'searches:*',
  searchState: (id: string) => `search:${id}:state`,
} as const;

// Redis 存储工具函数
export const redisUtils = {
  // 存储搜索数据
  async setSearchData(searchId: string, data: any): Promise<void> {
    await redis.set(REDIS_KEYS.search(searchId), JSON.stringify(data), {
      ex: 3600 * 24 * 7, // 7天过期
    });
  },

  // 获取搜索数据
  async getSearchData(searchId: string): Promise<any | null> {
    const data = await redis.get(REDIS_KEYS.search(searchId));
    if (!data) return null;
    return typeof data === 'string' ? JSON.parse(data) : data;
  },

  // 删除搜索数据
  async deleteSearchData(searchId: string): Promise<void> {
    await redis.del(REDIS_KEYS.search(searchId));
  },

  // 列出所有搜索
  async listSearches(): Promise<string[]> {
    const keys = await redis.keys('search:*');
    return keys.map(key => key.replace('search:', ''));
  },

  // 设置搜索状态（用于兼容现有API）
  async setSearchState(searchId: string, state: any): Promise<void> {
    await redis.set(REDIS_KEYS.searchState(searchId), JSON.stringify(state), {
      ex: 3600 * 24, // 1天过期
    });
  },

  // 获取搜索状态
  async getSearchState(searchId: string): Promise<any | null> {
    const state = await redis.get(REDIS_KEYS.searchState(searchId));
    if (!state) return null;
    return typeof state === 'string' ? JSON.parse(state) : state;
  },
}; 