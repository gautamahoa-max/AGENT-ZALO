import fs from "node:fs";
import path from "node:path";
import { tool } from "ai";
import nodemailer from "nodemailer";
import { z } from "zod";
import { dataDir, env } from "../../config/env.js";
import { getDateTimeParts } from "../../shared/current-datetime.js";
import type { ToolContext } from "./index.js";
import { ketQuaLoi } from "./tool-failure-result.js";
import { createLead } from "../../conversation/lead-store.js";
import { db } from "../../conversation/database.js";

const MO_TA = [
  "Gửi email thông báo khẩn cấp tới Gmail của Hoà (Gautamahoa@gmail.com) CHỈ TRONG 1 TRƯỜNG HỢP DUY NHẤT:",
  "- Khách hàng hoặc Môi giới CHỐT LỊCH HẸN GẶP TRỰC TIẾP / CÀ PHÊ tư vấn.",
  "",
  "⚠️ RED FLAGS (TUYỆT ĐỐI KHÔNG GỌI TOOL NÀY TRONG CÁC TRƯỜNG HỢP SAU):",
  "- Bất kỳ lý do nào khác ngoài việc hẹn gặp (kể cả khách vay khoản tiền cực lớn cũng KHÔNG gửi email).",
  "- Khách chỉ chào hỏi xã giao hoặc hỏi tư vấn thông thường.",
  "",
  "Dùng tool này để Hoà nắm bắt lịch hẹn ra ngoài gặp khách.",
].join("\n");

const INTEREST_LABELS: Record<string, string> = {
  vay_mua_nha: "Vay mua nhà",
  vay_the_chap: "Vay thế chấp",
  the_tin_dung: "Thẻ tín dụng OCB",
  bds_palm_city: "BĐS Palm City / Palm River",
  bds_bcons: "BĐS Bcons",
  bds_the_prive: "BĐS The Privé",
  bds_gladia: "BĐS Gladia",
  hen_gap_cafe: "Lịch hẹn gặp / Cà phê",
  khac: "Nhu cầu khác",
};

const URGENCY_ICONS: Record<string, string> = {
  cao: "🔴 Khẩn cấp (Cần xử lý ngay)",
  trung_binh: "🟡 Quan trọng (Xử lý trong ngày)",
  thap: "🟢 Bình thường",
};

export function createNotifyVipLeadTool({ account, message }: ToolContext) {
  return tool({
    description: MO_TA,
    inputSchema: z.object({
      customer_name: z
        .string()
        .min(2)
        .max(100)
        .describe("Tên hoặc danh xưng của khách hàng (VD: Anh Tuấn, Chị Mai)"),
      interest_type: z
        .enum([
          "vay_mua_nha",
          "vay_the_chap",
          "the_tin_dung",
          "bds_palm_city",
          "bds_bcons",
          "bds_the_prive",
          "bds_gladia",
          "hen_gap_cafe",
          "khac",
        ])
        .describe("Nhu cầu chính của khách hàng"),
      estimated_value: z
        .string()
        .optional()
        .describe("Giá trị ước tính (VD: 'Vay 3.5 tỷ', 'Căn 2PN 2.2 tỷ', 'Thẻ World 300tr')"),
      details: z
        .string()
        .min(5)
        .max(2000)
        .describe(
          "Tóm tắt chi tiết nhu cầu: thu nhập, vốn tự có, tình trạng tài chính, mong muốn cụ thể",
        ),
      action_needed: z
        .string()
        .min(5)
        .max(500)
        .describe(
          "Hành động cụ thể Hoà cần thực hiện tiếp (VD: 'Gọi điện thoại hẹn giờ cà phê sáng thứ 7', 'Lên bảng tính chi tiết gửi trước 11h')",
        ),
      urgency: z
        .enum(["cao", "trung_binh", "thap"])
        .default("cao")
        .describe("Mức độ khẩn cấp: 'cao' (ưu tiên số 1), 'trung_binh', 'thap'"),
    }),
    execute: async ({
      customer_name,
      interest_type,
      estimated_value,
      details,
      action_needed,
      urgency = "cao",
    }) => {
      const dt = getDateTimeParts(env.BOT_TIMEZONE);
      const timeStr = `${dt.time} ngày ${dt.date} (${dt.weekday})`;
      const interestLabel = INTEREST_LABELS[interest_type] || interest_type;
      const urgencyLabel = URGENCY_ICONS[urgency] || urgency;

      // 1. Lưu backup lead vào file data/vip-leads.jsonl để không bao giờ mất dữ liệu
      const leadRecord = {
        timestamp: timeStr,
        accountId: account.id,
        threadId: message.threadId,
        senderId: message.senderId,
        senderName: message.senderName,
        customer_name,
        interest_type,
        estimated_value: estimated_value || "Chưa rõ",
        details,
        action_needed,
        urgency,
      };

      try {
        const leadFile = path.join(dataDir, "vip-leads.jsonl");
        fs.appendFileSync(leadFile, JSON.stringify(leadRecord) + "\n", "utf-8");
      } catch (err) {
        console.error("Lỗi khi ghi file vip-leads.jsonl:", err);
      }

      // Lưu vào bảng leads trong SQLite cho ROI Analytics & A/B attribution
      try {
        let expId: string | null = null;
        let expVar: string | null = null;
        try {
          const expRow = db
            .prepare(
              "SELECT experiment_id, variant FROM experiment_assignments WHERE thread_id = ? ORDER BY assigned_at DESC LIMIT 1",
            )
            .get(message.threadId) as { experiment_id: string; variant: string } | undefined;
          if (expRow) {
            expId = expRow.experiment_id;
            expVar = expRow.variant;
          }
        } catch {
          /* optional */
        }

        createLead({
          accountId: account.id,
          threadId: message.threadId,
          senderId: message.senderId,
          senderName: message.senderName,
          customerName: customer_name,
          interestType: interest_type,
          estimatedValue: estimated_value || "",
          details,
          actionNeeded: action_needed,
          urgency,
          experimentId: expId,
          experimentVariant: expVar,
        });
      } catch (err) {
        console.error("Lỗi khi lưu Lead vào DB:", err);
      }

      // 2. Cấu hình gửi mail
      const recipientEmail =
        process.env.NOTIFY_EMAIL_TO || process.env.GMAIL_USER || "Gautamahoa@gmail.com";
      const gmailUser = process.env.GMAIL_USER || "Gautamahoa@gmail.com";
      const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_APP_PASSWORD;

      if (!gmailPass) {
        return `Đã ghi nhận và lưu hồ sơ khách VIP (${customer_name} - ${interestLabel}) vào hệ thống thành công! (Lưu ý: Để email tự động gửi về ${recipientEmail}, vui lòng cấu hình biến GMAIL_APP_PASSWORD trong file .env).`;
      }

      // 3. Tạo nội dung email HTML chuẩn nhận diện OCB & BĐS
      const subject = `[VIP LEAD 🌟] ${customer_name} - ${interestLabel} (${estimated_value || "Cần tư vấn"})`;

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; color: #333; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08); border: 1px solid #e1e8ed; }
    .header { background: linear-gradient(135deg, #00875A 0%, #0052CC 100%); color: #ffffff; padding: 24px; text-align: center; }
    .header h2 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
    .header p { margin: 6px 0 0 0; opacity: 0.9; font-size: 13px; }
    .content { padding: 24px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .badge-urgent { background: #ffebee; color: #c62828; }
    .badge-medium { background: #fff8e1; color: #f57f17; }
    .badge-normal { background: #e8f5e9; color: #2e7d32; }
    .table-info { width: 100%; border-collapse: collapse; margin-top: 15px; }
    .table-info td { padding: 10px 12px; border-bottom: 1px solid #f0f2f5; font-size: 14px; }
    .table-info td.label { font-weight: 600; color: #5e6c84; width: 35%; }
    .table-info td.value { color: #172b4d; font-weight: 500; }
    .box { background: #f8fafc; border-left: 4px solid #00875A; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-top: 18px; }
    .box.action { border-left-color: #ff9800; background: #fffdf9; }
    .box h4 { margin: 0 0 6px 0; font-size: 13px; text-transform: uppercase; color: #6b778c; }
    .box p { margin: 0; font-size: 14px; line-height: 1.5; color: #172b4d; }
    .footer { text-align: center; padding: 16px; font-size: 12px; color: #8993a4; background: #fafbfc; border-top: 1px solid #f0f2f5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>🌟 CƠ HỘI KHÁCH HÀNG VIP MỚI</h2>
      <p>Hệ thống Trợ lý Zalo AI - OCB Chi nhánh Gia Định</p>
    </div>
    <div class="content">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="badge ${urgency === "cao" ? "badge-urgent" : urgency === "trung_binh" ? "badge-medium" : "badge-normal"}">${urgencyLabel}</span>
        <span style="font-size: 12px; color: #8993a4;">⏰ ${timeStr}</span>
      </div>

      <table class="table-info">
        <tr>
          <td class="label">Khách hàng:</td>
          <td class="value" style="font-size: 16px; color: #0052CC;"><strong>${customer_name}</strong></td>
        </tr>
        <tr>
          <td class="label">Nhu cầu:</td>
          <td class="value"><strong>${interestLabel}</strong></td>
        </tr>
        <tr>
          <td class="label">Giá trị ước tính:</td>
          <td class="value" style="color: #00875A; font-weight: 700;">${estimated_value || "Chưa xác định"}</td>
        </tr>
        <tr>
          <td class="label">Nguồn Zalo:</td>
          <td class="value">${message.senderName} (${message.isGroup ? "Nhóm" : "Chat 1-1"})</td>
        </tr>
      </table>

      <div class="box">
        <h4>📋 Tóm tắt nhu cầu & Trao đổi</h4>
        <p>${details.replace(/\n/g, "<br>")}</p>
      </div>

      <div class="box action">
        <h4 style="color: #d97706;">⚡ Hành động Hoà cần xử lý ngay</h4>
        <p><strong>${action_needed.replace(/\n/g, "<br>")}</strong></p>
      </div>
    </div>
    <div class="footer">
      Email tự động gửi từ Zalo Agent • OCB Gia Định & Real Estate Assistant
    </div>
  </div>
</body>
</html>
      `;

      try {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: gmailUser,
            pass: gmailPass,
          },
        });

        await transporter.sendMail({
          from: `"Hoà OCB - Zalo Agent" <${gmailUser}>`,
          to: recipientEmail,
          subject,
          html: htmlContent,
        });

        return `Đã gửi thông báo khách VIP tới Gmail ${recipientEmail} thành công!`;
      } catch (err: any) {
        console.error("Lỗi khi gửi email qua Gmail:", err);
        return ketQuaLoi(
          `Lỗi khi gửi email qua Gmail (${err.message || err}). Dữ liệu đã được lưu an toàn vào data/vip-leads.jsonl.`,
        );
      }
    },
  });
}
