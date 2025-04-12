// Netlify版本的webhook处理函数
// 用于接收GitHub Actions回调
exports.handler = async function(event, context) {
  try {
    // 确保是POST请求
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method Not Allowed" })
      };
    }

    // 解析请求体
    const payload = JSON.parse(event.body);
    const { id, status, result } = payload;

    console.log(`接收到GitHub Actions回调: ${id}, 状态: ${status}`);
    
    // 在这里处理数据存储
    // 如果使用外部数据库，这里需要添加相关代码
    // 例如: MongoDB, Firebase, Supabase等

    // 返回成功响应
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Webhook received successfully",
        id: id,
        status: status
      })
    };
  } catch (error) {
    console.error("Webhook处理错误:", error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error", details: error.message })
    };
  }
};