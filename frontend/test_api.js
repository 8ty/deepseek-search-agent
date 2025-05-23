// 简单的 API 测试脚本
const axios = require('axios');

const TEST_QUERY = "测试搜索";
const BASE_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

async function testAPI() {
  console.log('🧪 开始测试 API...');
  
  try {
    // 1. 测试触发搜索（现在包含 workspace_id）
    console.log('\n📡 测试触发搜索...');
    const searchResponse = await axios.post(`${BASE_URL}/api/trigger-search`, {
      query: TEST_QUERY,
      workspace_id: 'test-ws-' + Date.now(),
      search_id: 'test-search-' + Date.now(),
      max_results: 5,
      include_scraping: true
    });
    
    console.log('✅ 搜索触发成功:', searchResponse.data);

    // 2. 测试状态查询（需要 workspace_id）
    if (searchResponse.data.workspace_id && searchResponse.data.search_id) {
      console.log('\n📊 测试状态查询...');
      
      const statusResponse = await axios.get(
        `${BASE_URL}/api/search-status/${searchResponse.data.search_id}?workspace_id=${searchResponse.data.workspace_id}`
      );
      
      console.log('✅ 状态查询成功:', statusResponse.data);
    }

  } catch (error) {
    console.error('❌ 测试失败:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
  }
}

if (require.main === module) {
  testAPI();
}

module.exports = { testAPI }; 