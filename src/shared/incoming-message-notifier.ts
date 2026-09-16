import nodemailer from "nodemailer";
import { getDateTimeParts } from "../shared/current-datetime.js";
import { env } from "../config/env.js";
import type { ParsedMessage } from "../zalo/zalo-message-parser.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("email-notifier");

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const user = process.env.GMAIL_USER || "Gautamahoa@gmail.com";
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_APP_PASSWORD;

  if (!pass) return null;

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter;
}

/**
 * Gửi email thông báo tự động tới Gmail của Hoà mỗi khi có BẤT KỲ AI nhắn tin trên Zalo.
 * Chạy bất đồng bộ ngầm (fire-and-forget), không làm nghẽn luồng trả lời của bot.
 */
export async function notifyIncomingZaloMessage(batch: ParsedMessage[]): Promise<void> {
  if (!batch || batch.length === 0) return;

  const mailer = getTransporter();
  if (!mailer) {
    log.debug("Chưa cấu hình GMAIL_APP_PASSWORD, bỏ qua thông báo email.");
    return;
  }

  const latest = batch[batch.length - 1]!;
  const senderName = latest.senderName || "Khách hàng Zalo";
  const isGroup = latest.isGroup;
  const threadTypeStr = isGroup ? `Nhóm (ID: ${latest.threadId})` : "Chat riêng 1-1";

  // Tổng hợp nội dung các tin nhắn trong đợt này
  const messageTexts = batch
    .map((m) => {
      const text = m.text ? m.text : "";
      const imgNote = m.images && m.images.length > 0 ? ` [Kèm ${m.images.length} ảnh]` : "";
      return text + imgNote;
    })
    .filter(Boolean)
    .join("\n");

  if (!messageTexts.trim()) return;

  const dt = getDateTimeParts(env.BOT_TIMEZONE);
  const timeStr = `${dt.time} ngày ${dt.date} (${dt.weekday})`;

  const recipient = process.env.NOTIFY_EMAIL_TO || process.env.GMAIL_USER || "Gautamahoa@gmail.com";
  const senderEmail = process.env.GMAIL_USER || "Gautamahoa@gmail.com";

  const preview = messageTexts.length > 60 ? messageTexts.slice(0, 60) + "..." : messageTexts;
  const subject = `[ZALO 💬] ${senderName} vừa nhắn: "${preview}"`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f0f2f5; margin: 0; padding: 20px; color: #1c1e21; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #e4e6eb; }
    .header { background: linear-gradient(135deg, #0068FF 0%, #004ecc 100%); color: #ffffff; padding: 20px; text-align: center; }
    .header h2 { margin: 0; font-size: 19px; font-weight: 700; }
    .header p { margin: 4px 0 0 0; opacity: 0.9; font-size: 13px; }
    .content { padding: 20px 24px; }
    .meta-box { background: #f7f8fa; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; border: 1px solid #eaebee; }
    .meta-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; }
    .meta-row:last-child { margin-bottom: 0; }
    .meta-label { color: #65676b; font-weight: 600; }
    .meta-value { color: #050505; font-weight: 500; }
    .msg-bubble { background: #e7f3ff; border-left: 4px solid #0068FF; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-top: 12px; }
    .msg-bubble h4 { margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; color: #0068FF; letter-spacing: 0.5px; }
    .msg-bubble p { margin: 0; font-size: 15px; line-height: 1.5; color: #050505; white-space: pre-wrap; font-weight: 500; }
    .footer { text-align: center; padding: 14px; font-size: 11px; color: #8a8d91; background: #fbfbfb; border-top: 1px solid #f0f2f5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>💬 CÓ TIN NHẮN ZALO MỚI</h2>
      <p>Hệ thống Trợ lý Zalo AI - OCB Gia Định</p>
    </div>
    <div class="content">
      <div class="meta-box">
        <div class="meta-row">
          <span class="meta-label">Người gửi:</span>
          <span class="meta-value" style="color: #0068FF; font-weight: 700; font-size: 15px;">${senderName}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Kênh:</span>
          <span class="meta-value">${threadTypeStr}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Thời gian:</span>
          <span class="meta-value">⏰ ${timeStr}</span>
        </div>
      </div>

      <div class="msg-bubble">
        <h4>Nội dung tin nhắn nhận được:</h4>
        <p>${messageTexts.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>
      </div>

      <p style="font-size: 13px; color: #65676b; margin-top: 16px; text-align: center;">
        💡 <em>Bot đang tự động tiếp nhận và trả lời. Anh Hoà có thể mở Zalo vào tương tác tiếp bất cứ lúc nào!</em>
      </p>
    </div>
    <div class="footer">
      Email tự động gửi từ Zalo Agent • ${recipient}
    </div>
  </div>
</body>
</html>
  `;

  try {
    await mailer.sendMail({
      from: `"Zalo Alert - Hoà OCB" <${senderEmail}>`,
      to: recipient,
      subject,
      html,
    });
    log.info({ senderName, recipient }, "Đã gửi email thông báo tin nhắn Zalo mới tới Gmail");
  } catch (err: any) {
    log.error({ err: err.message, senderName }, "Gửi email thông báo tin nhắn mới thất bại");
  }
}
