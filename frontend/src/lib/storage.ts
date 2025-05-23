// 共享的内存存储模块
// 这个模块会被所有API路由共享

class MemoryStorage {
  private store: Record<string, any> = {};

  set(key: string, value: any): void {
    console.log(`[STORAGE] Setting key: ${key}`);
    this.store[key] = value;
    console.log(`[STORAGE] Current keys:`, Object.keys(this.store));
  }

  get(key: string): any {
    console.log(`[STORAGE] Getting key: ${key}`);
    console.log(`[STORAGE] Available keys:`, Object.keys(this.store));
    const value = this.store[key];
    console.log(`[STORAGE] Retrieved value:`, value ? 'Found' : 'Not found');
    return value;
  }

  has(key: string): boolean {
    return key in this.store;
  }

  delete(key: string): boolean {
    if (key in this.store) {
      delete this.store[key];
      return true;
    }
    return false;
  }

  keys(): string[] {
    return Object.keys(this.store);
  }

  clear(): void {
    this.store = {};
  }
}

// 创建单例实例
const memoryStorage = new MemoryStorage();

export default memoryStorage; 