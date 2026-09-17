import fs from "node:fs";
import path from "node:path";
import { tool } from "ai";
import nodemailer from "nodemailer";
import { z } from "zod";
import { dataDir, env } from "../../config/env.js";
import { db } from "../../conversation/database.js";
import { createLead } from "../../conversation/lead-store.js";
import { handoffThread } from "../../conversation/thread-store.js";
import { cancelPendingMessages } from "../../middleware/message-batcher.js";
import { getDateTimeParts } from "../../shared/current-datetime.js";
import { escapeHtml } from "../../shared/escape-html.js";
import type { ToolContext } from "./index.js";
import { ketQuaLoi } from "./tool-failure-result.js";

const DESCRIPTION = [
  "Trao quyền cuộc trò chuyện cho Hoà và dừng bot ngay lập tức.",
  "CHỈ gọi khi khách đã xác nhận rõ một trong các việc: hẹn gặp/cà phê, muốn nói chuyện trực tiếp với Hoà, hoặc cần người thật xử lý khiếu nại.",
  "Không gọi khi khách mới hỏi thông tin, nói 'để suy nghĩ', hoặc chưa xác nhận gặp.",
  "Tool tự tạo lead, hủy tin đang chờ và thông báo cho Hoà. Sau khi tool thành công, chỉ gửi MỘT câu xác nhận ngắn rồi kết thúc.",
].join("\n");

const INTEREST_LABELS: Record<string, string> = {
  vay_mua_nha: "Vay mua nhà",
  vay_the_chap: "Vay thế chấp",
  the_tin_dung: "Thẻ tín dụng OCB",
  tien_gui: "Tiền gửi / tiết kiệm",
  bds_palm_city: "BĐS Palm City / Palm River",
  bds_bcons: "BĐS Bcons",
  bds_the_prive: "BĐS The Privé",
  bds_gladia: "BĐS Gladia",
  khac: "Nhu cầu khác",
};

const REASON_LABELS: Record<string, string> = {
  meeting_confirmed: "Khách đã chốt lịch gặp",
  customer_requested_human: "Khách yêu cầu nói chuyện với Hoà",
  complaint: "Khiếu nại cần người thật xử lý",
};

function appendLeadBackup(record: Record<string, unknown>): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(
      path.join(dataDir, "vip-leads.jsonl"),
      `${JSON.stringify(record)}\n`,
      "utf-8",
    );
  } catch (error) {
    console.error("Lỗi khi ghi vip-leads.jsonl:", error);
  }
}

async function notifyOwner(input: {
  customerName: string;
  interestLabel: string;
  reasonLabel: string;
  estimatedValue: string;
  details: string;
  actionNeeded: string;
  meetingArea: string;
  meetingTime: string;
  source: string;
  time: string;
}): Promise<{ sent: boolean; detail: string }> {
  const recipient = process.env.NOTIFY_EMAIL_TO || process.env.GMAIL_USER || "Gautamahoa@gmail.com";
  const gmailUser = process.env.GMAIL_USER || "Gautamahoa@gmail.com";
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_APP_PASSWORD;
  if (!gmailPass) return { sent: false, detail: "chưa cấu hình GMAIL_APP_PASSWORD" };

  const line = (value: string) => escapeHtml(value).replaceAll("\n", "<br>");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });
  try {
    await transporter.sendMail({
      from: `"Hoà OCB - Zalo Agent" <${gmailUser}>`,
      to: recipient,
      subject: `[HANDOFF] ${input.customerName} - ${input.interestLabel}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:620px;margin:auto">
          <h2 style="color:#0052cc">Khách hàng đã được bàn giao cho Hoà</h2>
          <p><strong>Khách:</strong> ${line(input.customerName)}</p>
          <p><strong>Lý do:</strong> ${line(input.reasonLabel)}</p>
          <p><strong>Nhu cầu:</strong> ${line(input.interestLabel)}</p>
          <p><strong>Giá trị:</strong> ${line(input.estimatedValue || "Chưa rõ")}</p>
          <p><strong>Khu vực:</strong> ${line(input.meetingArea || "Chưa chốt")}</p>
          <p><strong>Thời gian:</strong> ${line(input.meetingTime || "Chưa chốt")}</p>
          <p><strong>Tóm tắt:</strong><br>${line(input.details)}</p>
          <p><strong>Việc cần làm:</strong><br>${line(input.actionNeeded)}</p>
          <p style="color:#6b7280">Nguồn: ${line(input.source)} · ${line(input.time)}</p>
          <p style="color:#16a34a"><strong>Bot đã dừng tại cuộc trò chuyện này.</strong></p>
        </div>`,
    });
    return { sent: true, detail: recipient };
  } catch (error) {
    return { sent: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export function createHandoffToHumanTool({ account, message }: ToolContext) {
  return tool({
    description: DESCRIPTION,
    inputSchema: z.object({
      customer_confirmed: z
        .boolean()
        .describe(
          "Bắt buộc true khi khách đã xác nhận rõ muốn gặp/nói chuyện với người thật; false thì tool sẽ từ chối handoff",
        ),
      handoff_reason: z.enum(["meeting_confirmed", "customer_requested_human", "complaint"]),
      customer_name: z.string().min(2).max(100),
      interest_type: z.enum([
        "vay_mua_nha",
        "vay_the_chap",
        "the_tin_dung",
        "tien_gui",
        "bds_palm_city",
        "bds_bcons",
        "bds_the_prive",
        "bds_gladia",
        "khac",
      ]),
      estimated_value: z.string().max(200).optional(),
      details: z.string().min(5).max(2000),
      action_needed: z.string().min(5).max(500),
      meeting_area: z.string().max(300).optional(),
      meeting_time: z.string().max(300).optional(),
      urgency: z.enum(["cao", "trung_binh", "thap"]).default("cao"),
    }),
    execute: async ({
      customer_confirmed,
      handoff_reason,
      customer_name,
      interest_type,
      estimated_value,
      details,
      action_needed,
      meeting_area,
      meeting_time,
      urgency = "cao",
    }) => {
      if (customer_confirmed !== true) {
        return ketQuaLoi("Khách chưa xác nhận rõ việc gặp hoặc nói chuyện với người thật; chưa được handoff.");
      }

      const summary = [
        details,
        meeting_area ? `Khu vực: ${meeting_area}` : "",
        meeting_time ? `Thời gian: ${meeting_time}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      let changed = false;
      try {
        db.exec("BEGIN IMMEDIATE");
        const transition = handoffThread({
          accountId: account.id,
          threadId: message.threadId,
          threadType: message.threadType,
          displayName: message.senderName,
          lastSenderName: message.senderName,
          reason: handoff_reason,
          summary,
        });
        changed = transition.changed;

        if (changed) {
          const experiment = db
            .prepare(
              "SELECT experiment_id, variant FROM experiment_assignments WHERE thread_id = ? ORDER BY assigned_at DESC LIMIT 1",
            )
            .get(message.threadId) as { experiment_id: string; variant: string } | undefined;
          createLead({
            accountId: account.id,
            threadId: message.threadId,
            senderId: message.senderId,
            senderName: message.senderName,
            customerName: customer_name,
            interestType: interest_type,
            estimatedValue: estimated_value || "",
            details: summary,
            actionNeeded: action_needed,
            urgency,
            experimentId: experiment?.experiment_id ?? null,
            experimentVariant: experiment?.variant ?? null,
            status: "appointment_booked",
          });
        }
        db.exec("COMMIT");
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // Transaction chưa mở hoặc đã tự rollback.
        }
        return ketQuaLoi(
          `Không thể chuyển hội thoại sang người thật: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (!changed) {
        return "HANDOFF_ALREADY_ACTIVE: Hội thoại đã thuộc về Hoà. Không tạo thêm lead hoặc gửi thêm email.";
      }

      cancelPendingMessages(`${account.id}:${message.threadId}`);
      const dt = getDateTimeParts(env.BOT_TIMEZONE);
      const time = `${dt.time} ngày ${dt.date} (${dt.weekday})`;
      const record = {
        event: "handoff_to_human",
        timestamp: time,
        accountId: account.id,
        threadId: message.threadId,
        senderId: message.senderId,
        senderName: message.senderName,
        customer_name,
        handoff_reason,
        interest_type,
        estimated_value: estimated_value || "Chưa rõ",
        details: summary,
        action_needed,
        urgency,
      };
      appendLeadBackup(record);

      const email = await notifyOwner({
        customerName: customer_name,
        interestLabel: INTEREST_LABELS[interest_type] || interest_type,
        reasonLabel: REASON_LABELS[handoff_reason] || handoff_reason,
        estimatedValue: estimated_value || "",
        details: summary,
        actionNeeded: action_needed,
        meetingArea: meeting_area || "",
        meetingTime: meeting_time || "",
        source: `${message.senderName} (${message.isGroup ? "Nhóm" : "Chat 1-1"})`,
        time,
      });

      return [
        "HANDOFF_OK: Bot đã dừng ở cuộc trò chuyện này và quyền xử lý đã chuyển cho Hoà.",
        email.sent
          ? `Đã gửi thông báo tới ${email.detail}.`
          : `Lead đã lưu an toàn; email chưa gửi được (${email.detail}).`,
        "Chỉ nhắn khách một câu xác nhận ngắn, không tư vấn thêm và không gọi lại tool.",
      ].join(" ");
    },
  });
}

/** Giữ export cũ cho code tích hợp bên ngoài trong một chu kỳ nâng cấp. */
export const createNotifyVipLeadTool = createHandoffToHumanTool;
