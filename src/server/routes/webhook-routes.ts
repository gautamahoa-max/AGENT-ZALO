import { Hono } from "hono";
import { createLogger } from "../../shared/logger.js";
import { EventEmitter } from "node:events";

const log = createLogger("zalo-webhook");

// HÀNG ĐỢI IN-MEMORY (Có thể thay thế bằng Redis/RabbitMQ khi scale)
export const webhookQueue = new EventEmitter();

export const webhookRoutes = new Hono();

// Zalo gửi tin -> Node.js nhận
webhookRoutes.post("/", async (c) => {
  try {
    const payload = await c.req.json();
    log.info({ event: payload.event_name }, "Nhận Webhook từ Zalo OA");

    // Đẩy vào hàng đợi (Background Processing)
    webhookQueue.emit("new_message", payload);

    // TRẢ LỜI NGAY LẬP TỨC 200 OK TRONG VÒNG 10ms
    // Chống Time-out và chống Zalo gửi lặp tin nhắn
    return c.json({ error: 0, message: "ok" }, 200);
  } catch (error) {
    log.error({ error }, "Lỗi khi nhận Zalo Webhook");
    return c.json({ error: -1, message: "Lỗi hệ thống" }, 500);
  }
});
