import nodemailer from "nodemailer";
import { createLogger } from "./logger.js";
import { getDateTimeParts } from "./current-datetime.js";
import { env } from "../config/env.js";

const log = createLogger("email-alert");

// Lưu timestamp của các lần gửi alert gần nhất theo key để debounce (30 phút)
const lastSentTimestamps = new Map<string, number>();
const DEBOUNCE_COOLDOWN_MS = 30 * 60_000; // 30 phút

export interface AlertOptions {
  alertKey: string;
  title: string;
  message: string;
  details?: Record<string, unknown>;
  dashboardUrl?: string;
}

/**
 * Gửi email cảnh báo khẩn cấp tới chủ bot (Gautamahoa@gmail.com)
 * Tự động debounce 30 phút cho cùng 1 loại lỗi để chống spam hộp thư.
 */
export async function sendSystemAlert(options: AlertOptions): Promise<boolean> {
  const { alertKey, title, message, details, dashboardUrl = "http://100.90.89.73:3900/accounts" } = options;

  const now = Date.now();
  const lastSent = lastSentTimestamps.get(alertKey) || 0;
  if (now - lastSent < DEBOUNCE_COOLDOWN_MS) {
    const remainMin = Math.ceil((DEBOUNCE_COOLDOWN_MS - (now - lastSent)) / 60_000);
    log.info(
      { alertKey, remainMin },
      "Email alert bị chặn bởi debounce cooldown để tránh spam hộp thư",
    );
    return false;
  }

  const gmailUser = process.env.GMAIL_USER || "Gautamahoa@gmail.com";
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_APP_PASSWORD;
  const recipient = process.env.NOTIFY_EMAIL_TO || gmailUser;

  if (!gmailPass) {
    log.warn({ alertKey }, "Không có GMAIL_APP_PASSWORD trong .env, bỏ qua gửi alert email");
    return false;
  }

  const dt = getDateTimeParts(env.BOT_TIMEZONE);
  const timeStr = `${dt.time} ngày ${dt.date} (${dt.weekday})`;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

  const detailsHtml = details
    ? `<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-top: 15px; font-family: monospace; font-size: 13px; color: #334155; white-space: pre-wrap;">${JSON.stringify(
        details,
        null,
        2,
      )}</div>`
    : "";

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #cbd5e1; }
    .header { background: #dc2626; color: #ffffff; padding: 20px 24px; }
    .header h2 { margin: 0; font-size: 18px; font-weight: 700; }
    .header p { margin: 4px 0 0 0; opacity: 0.9; font-size: 13px; }
    .content { padding: 24px; line-height: 1.6; }
    .btn { display: inline-block; background: #0284c7; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 16px; font-size: 14px; }
    .footer { padding: 16px; background: #f8fafc; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>⚠️ CẢNH BÁO HỆ THỐNG ZALO AGENT</h2>
      <p>Thời gian ghi nhận: ${timeStr}</p>
    </div>
    <div class="content">
      <h3 style="margin-top: 0; color: #dc2626;">${title}</h3>
      <p style="font-size: 15px; color: #334155;">${message}</p>
      ${detailsHtml}
      <div style="text-align: center; margin-top: 24px;">
        <a href="${dashboardUrl}" class="btn" target="_blank">📲 MỞ DASHBOARD QUÉT LẠI MÃ QR</a>
      </div>
      <p style="margin-top: 20px; font-size: 13px; color: #64748b;">
        *Nếu bạn đang ở ngoài, có thể truy cập qua địa chỉ Tailscale VPN hoặc mạng nội bộ.
      </p>
    </div>
    <div class="footer">
      Zalo Agent Watchdog Monitor • Tự động gửi bởi hệ thống
    </div>
  </div>
</body>
</html>
  `.trim();

  try {
    await transporter.sendMail({
      from: `"Zalo Agent Watchdog" <${gmailUser}>`,
      to: recipient,
      subject: `[CẢNH BÁO ZALO AGENT] ${title}`,
      html: htmlBody,
    });

    lastSentTimestamps.set(alertKey, now);
    log.info({ alertKey, recipient }, "Đã gửi email cảnh báo hệ thống thành công");
    return true;
  } catch (error) {
    log.error({ alertKey, error }, "Gửi email cảnh báo hệ thống thất bại");
    return false;
  }
}
