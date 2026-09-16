import { webhookQueue } from "../server/routes/webhook-routes.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("background-worker");

// Giả lập Worker xử lý nền độc lập với Webhook
export function startBackgroundWorker() {
  log.info("Khởi động Background Worker (Message Queue Consumer)...");

  webhookQueue.on("new_message", async (payload) => {
    log.info({ msgId: payload.message?.msg_id }, "Worker bắt đầu xử lý tin nhắn");
    
    try {
      // Ở đây sẽ gọi đến LLM, gọi Tool, và duyệt Compliance (mất 5-10s)
      // Chạy hoàn toàn độc lập, không block Zalo Webhook
      await mockProcessLLM(payload);
      
      log.info({ msgId: payload.message?.msg_id }, "Worker xử lý xong, đã gửi trả Zalo");
    } catch (error) {
      log.error({ error }, "Worker gặp lỗi trong lúc xử lý");
    }
  });
}

async function mockProcessLLM(payload: any) {
  // Giả lập thời gian LLM suy nghĩ (5-10s)
  return new Promise((resolve) => setTimeout(resolve, 5000));
}
