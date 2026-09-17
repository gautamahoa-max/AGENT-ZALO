import fs from "node:fs";
import { Hono } from "hono";
import {
  claimPendingApproval,
  getApproval,
  markApprovalSent,
  releaseApprovalAfterFailure,
} from "../../conversation/approval-store.js";
import { escapeHtml } from "../../shared/escape-html.js";
import { guiFileKemCaption } from "../../agent/tools/send-attachment-with-caption.js";
import { getRunningAccountApi } from "../../zalo/account-manager.js";

function page(title: string, body: string, color = "#172b4d"): string {
  return `<!doctype html>
<html lang="vi">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f6f9;margin:0;padding:32px;color:#172b4d">
  <main style="max-width:620px;margin:auto;background:white;border:1px solid #e1e8ed;border-radius:12px;padding:28px;box-shadow:0 4px 15px rgba(0,0,0,.08)">
    <h2 style="margin-top:0;color:${color}">${escapeHtml(title)}</h2>
    ${body}
  </main>
</body>
</html>`;
}

function sameOriginRequest(requestUrl: string, origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(requestUrl).host;
  } catch {
    return false;
  }
}

export const approvalRoutes = new Hono()
  .get("/:id", (c) => {
    c.header("Cache-Control", "no-store");
    const record = getApproval(c.req.param("id"));

    if (!record) {
      return c.html(page("Không tìm thấy yêu cầu duyệt", "<p>Liên kết không tồn tại.</p>", "#dc2626"), 404);
    }
    if (record.status !== "pending") {
      return c.html(
        page(
          "Yêu cầu không còn chờ duyệt",
          `<p>Trạng thái hiện tại: <strong>${escapeHtml(record.status)}</strong>.</p>`,
          record.status === "sent" ? "#16a34a" : "#dc2626",
        ),
        409,
      );
    }
    if (!fs.existsSync(record.filePath)) {
      return c.html(page("File không còn tồn tại", "<p>Không thể gửi file này. Hãy tạo lại bảng tính.</p>", "#dc2626"), 410);
    }

    const previousError = record.lastError
      ? `<p style="color:#b45309"><strong>Lần gửi trước thất bại:</strong> ${escapeHtml(record.lastError)}</p>`
      : "";
    return c.html(
      page(
        "Xác nhận gửi file qua Zalo",
        `${previousError}
         <p><strong>Tài khoản:</strong> ${escapeHtml(record.accountId)}</p>
         <p><strong>Cuộc trò chuyện:</strong> ${escapeHtml(record.threadId)}</p>
         <p><strong>Lời nhắn:</strong> ${escapeHtml(record.caption)}</p>
         <p style="color:#6b7280">Bấm nút bên dưới mới thực sự gửi. Việc mở email hoặc xem trang này không gửi file.</p>
         <form method="post" action="/api/approve/${encodeURIComponent(record.id)}">
           <button type="submit" style="border:0;border-radius:8px;background:#16a34a;color:white;padding:12px 20px;font-weight:700;cursor:pointer">Duyệt và gửi qua Zalo</button>
         </form>`,
        "#0052cc",
      ),
    );
  })
  .post("/:id", async (c) => {
    c.header("Cache-Control", "no-store");
    if (!sameOriginRequest(c.req.url, c.req.header("origin"))) {
      return c.html(page("Yêu cầu không hợp lệ", "<p>Kiểm tra nguồn gửi thất bại. Vui lòng mở lại trang duyệt.</p>", "#dc2626"), 403);
    }

    const existing = getApproval(c.req.param("id"));
    if (!existing || existing.status !== "pending") {
      return c.html(page("Không thể duyệt", "<p>Yêu cầu đã được xử lý, hết hạn hoặc không tồn tại.</p>", "#dc2626"), 409);
    }
    if (!fs.existsSync(existing.filePath)) {
      return c.html(page("File không còn tồn tại", "<p>Hãy tạo lại bảng tính rồi duyệt lại.</p>", "#dc2626"), 410);
    }

    const api = getRunningAccountApi(existing.accountId);
    if (!api) {
      return c.html(page("Zalo chưa kết nối", `<p>Tài khoản ${escapeHtml(existing.accountId)} chưa chạy. File chưa được gửi.</p>`, "#dc2626"), 503);
    }

    const record = claimPendingApproval(existing.id);
    if (!record) {
      return c.html(page("Yêu cầu đang được xử lý", "<p>Một thao tác duyệt khác đã nhận yêu cầu này.</p>", "#b45309"), 409);
    }

    try {
      const threadKey = `${record.accountId}:${record.threadId}`;
      await guiFileKemCaption(
        api,
        threadKey,
        record.threadId,
        record.threadType,
        record.filePath,
        record.caption,
      );
      markApprovalSent(record.id);
      return c.html(
        page(
          "Đã duyệt và gửi thành công",
          "<p>File Excel đã được gửi qua Zalo. Yêu cầu này không thể gửi lại lần hai.</p>",
          "#16a34a",
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      releaseApprovalAfterFailure(record.id, message);
      return c.html(page("Gửi thất bại", `<p>${escapeHtml(message)}</p><p>Yêu cầu vẫn còn để anh thử lại.</p>`, "#dc2626"), 502);
    }
  });
