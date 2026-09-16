import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../../config/env.js";
import { guiFileKemCaption } from "../../agent/tools/send-attachment-with-caption.js";
import { getRunningAccountApi } from "../../zalo/account-manager.js";

const APPROVALS_FILE = path.join(dataDir, "pending-approvals.json");

export function savePendingApproval(record: any) {
  let data: any = {};
  if (fs.existsSync(APPROVALS_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(APPROVALS_FILE, "utf8"));
    } catch (e) {}
  }
  data[record.id] = record;
  fs.writeFileSync(APPROVALS_FILE, JSON.stringify(data, null, 2), "utf8");
}

export function getPendingApproval(id: string) {
  if (!fs.existsSync(APPROVALS_FILE)) return null;
  const data = JSON.parse(fs.readFileSync(APPROVALS_FILE, "utf8"));
  return data[id] || null;
}

export function removePendingApproval(id: string) {
  if (!fs.existsSync(APPROVALS_FILE)) return;
  const data = JSON.parse(fs.readFileSync(APPROVALS_FILE, "utf8"));
  delete data[id];
  fs.writeFileSync(APPROVALS_FILE, JSON.stringify(data, null, 2), "utf8");
}

export const approvalRoutes = new Hono().get("/:id", async (c) => {
  const id = c.req.param("id");
  const record = getPendingApproval(id);
  
  if (!record) {
    return c.html(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #dc2626;">Lỗi hoặc Đã được duyệt!</h2>
          <p>Không tìm thấy file cần duyệt hoặc file này đã được gửi cho khách rồi.</p>
        </body>
      </html>
    `);
  }

  const { filePath, caption, threadId, threadType, accountId } = record;
  const api = getRunningAccountApi(accountId);
  
  if (!api) {
    return c.html(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #dc2626;">Lỗi kết nối Zalo</h2>
          <p>Không tìm thấy phiên đăng nhập Zalo cho tài khoản ${accountId}.</p>
        </body>
      </html>
    `);
  }

  try {
    const threadKey = `${accountId}:${threadId}`;
    await guiFileKemCaption(api, threadKey, threadId, threadType, filePath, caption);
    removePendingApproval(id);
    
    return c.html(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #f0fdf4;">
          <h2 style="color: #16a34a;">✅ ĐÃ DUYỆT & GỬI THÀNH CÔNG!</h2>
          <p>File Excel đã được gửi tự động qua Zalo cho khách hàng.</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
      </html>
    `);
  } catch (err: any) {
    return c.html(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #dc2626;">Gửi thất bại!</h2>
          <p>${err.message}</p>
        </body>
      </html>
    `);
  }
});
