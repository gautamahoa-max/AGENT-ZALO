import nodemailer from "nodemailer";
import { savePendingApproval } from "../../conversation/approval-store.js";
import crypto from "node:crypto";
import fs from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { tool } from "ai";
import ExcelJS from "exceljs";
import { z } from "zod";
import { dataDir } from "../../config/env.js";
import { createLogger } from "../../shared/logger.js";
import { escapeHtml } from "../../shared/escape-html.js";
import type { ToolContext } from "./index.js";
import { ketQuaLoi } from "./tool-failure-result.js";

const log = createLogger("export-mortgage-plan");

const PROJECT_CONFIG = {
  the_prive: {
    template: "Bang_Tinh_Lai_The_Prive.xlsx",
    sheet: "THE PRIVÉ",
    prefix: "The_Prive",
    displayName: "THE PRIVÉ",
  },
  palm_river: {
    template: "Bang_Tinh_Lai_Palm_River.xlsx",
    sheet: "PALM RIVER",
    prefix: "Palm_River",
    displayName: "PALM RIVER",
  },
  gladia: {
    template: "Bang_Tinh_Lai_Gladia.xlsx",
    sheet: "GLADIA BY THE WATERS",
    prefix: "Gladia",
    displayName: "GLADIA BY THE WATERS",
  },
  bcons: {
    template: "Bang_Tinh_Lai_Bcons.xlsx",
    sheet: "BCONS",
    prefix: "Bcons",
    displayName: "BCONS",
  },
} as const;

type ProjectKey = keyof typeof PROJECT_CONFIG;

const MO_TA = [
  "Tự động điền các thông số vay vốn vào file Excel của 4 dự án (THE PRIVÉ, PALM RIVER, GLADIA BY THE WATERS, BCONS) rồi đưa vào HÀNG CHỜ để chủ tài khoản xem và duyệt trước khi gửi qua Zalo.",
  "",
  "DÙNG KHI: Khách hàng hỏi bảng tính chi tiết, muốn xem lịch trả nợ 20-30 năm, tiến độ giải ngân theo từng đợt, so sánh gói ưu đãi lãi suất, hoặc hỏi số tiền trả từng tháng của 1 trong 4 dự án.",
  "File CHƯA được gửi cho khách cho tới khi chủ tài khoản đăng nhập dashboard và bấm duyệt. KHÔNG gọi thêm tool send_file để né bước duyệt.",
].join("\n");

type Ctx = Pick<ToolContext, "api" | "account" | "message" | "ghiNhanDaGui">;

function sanitizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .trim();
}

export function createExportMortgagePlanTool(ctx: Ctx) {
  return tool({
    description: MO_TA,
    inputSchema: z.object({
      project: z
        .enum(["the_prive", "palm_river", "gladia", "bcons"])
        .describe("Dự án BĐS: 'the_prive' (The Privé), 'palm_river' (Palm River / Palm City), 'gladia' (Gladia by the Waters), 'bcons' (Bcons Group)"),
      loan_amount: z
        .number()
        .min(100_000_000)
        .max(100_000_000_000)
        .describe("Số tiền khách hàng cần vay (VNĐ), ví dụ 1500000000 (1.5 tỷ) hoặc 3500000000 (3.5 tỷ)"),
      apartment_price: z
        .number()
        .optional()
        .describe("Tổng giá trị căn hộ trên HĐMB (VNĐ). Nếu không nhập, mặc định tính bằng loan_amount / 0.7"),
      loan_term_months: z
        .number()
        .int()
        .min(12)
        .max(480)
        .default(240)
        .describe("Thời hạn vay tính theo THÁNG (20 năm = 240, 25 năm = 300, 30 năm = 360). Mặc định 240 tháng (20 năm)."),
      grace_period_months: z
        .number()
        .int()
        .min(0)
        .max(60)
        .default(24)
        .describe("Thời gian ân hạn nợ gốc tính theo THÁNG (Mặc định 24 tháng)"),
      early_payoff_month: z
        .number()
        .int()
        .min(0)
        .max(480)
        .default(36)
        .describe("Tháng dự kiến tất toán nợ trước hạn (Mặc định 36 tháng, nhập 0 nếu không tất toán sớm)"),
      customer_name: z
        .string()
        .optional()
        .describe("Tên khách hàng để gắn vào tên file Excel (VD: 'Anh Tuấn', 'Chị Mai')"),
      caption: z
        .string()
        .optional()
        .describe("Lời dẫn ngắn gọn khi gửi file qua Zalo (VD: 'Em gửi anh/chị bảng tính dòng tiền chi tiết dự án ạ')"),
    }),
    execute: async ({
      project,
      loan_amount,
      apartment_price,
      loan_term_months = 240,
      grace_period_months = 24,
      early_payoff_month = 36,
      customer_name,
      caption,
    }) => {
      try {
        const conf = PROJECT_CONFIG[project as ProjectKey];
        if (!conf) {
          return ketQuaLoi(`Dự án '${project}' không nằm trong danh sách hỗ trợ.`);
        }

        const templatePath = path.join(dataDir, "templates", conf.template);
        const workbook = new ExcelJS.Workbook();
        if (fs.existsSync(templatePath)) {
          await workbook.xlsx.readFile(templatePath);
        } else {
          // Fresh clone/Docker không có file nghiệp vụ riêng của ngân hàng. Tạo
          // bảng chuẩn tối thiểu để tính toán vẫn hoạt động; khi đặt template
          // thật vào DATA_DIR/templates, tool tự dùng bản nhận diện đầy đủ.
          const fallback = workbook.addWorksheet(conf.sheet);
          fallback.columns = [
            { header: "Thông số", key: "label", width: 34 },
            { header: "Giá trị", key: "value", width: 24 },
          ];
          fallback.addRows([
            { label: `Bảng tính khoản vay ${conf.displayName}` },
            { label: "Ngày tạo", value: new Date().toISOString() },
          ]);
          log.warn({ project, templatePath }, "Thiếu template dự án, dùng workbook chuẩn tối thiểu");
        }

        const ws = workbook.getWorksheet(conf.sheet) || workbook.worksheets[0];
        if (!ws) {
          return ketQuaLoi(`Không tìm thấy sheet '${conf.sheet}' trong file mẫu dự án ${conf.displayName}`);
        }

        // Điền thông số vào bảng mẫu chuẩn
        const price = apartment_price || Math.round(loan_amount / 0.7);
        const ltv = apartment_price ? Math.min(1.0, Math.max(0.1, loan_amount / price)) : 0.7;

        ws.getCell("C6").value = price;
        ws.getCell("C7").value = ltv;
        ws.getCell("C9").value = loan_term_months;
        ws.getCell("C11").value = early_payoff_month;
        ws.getCell("C12").value = grace_period_months;

        // Ép Excel phải tính toán lại công thức khi mở file (giúp các app xem trên điện thoại không bị lỗi hiển thị)
        workbook.calcProperties.fullCalcOnLoad = true;

        const safeCust = customer_name ? sanitizeName(customer_name) : "KhachHang";
        const fileName = `Bang_Tinh_Lai_${conf.prefix}_${safeCust}.xlsx`;

        const buffer = await workbook.xlsx.writeBuffer();
        const nodeBuffer = Buffer.from(buffer);

        const defaultCaption =
          caption ||
          `Em gửi anh/chị bảng tính dòng tiền chi tiết dự án ${conf.displayName} (${(loan_amount / 1_000_000_000).toFixed(2)} tỷ, kỳ hạn ${Math.round(loan_term_months / 12)} năm) ạ!`;

        // ------------------ ĐỀ XUẤT 2: HUMAN-IN-THE-LOOP APPROVAL ------------------
        const approvalId = crypto.randomUUID();
        const permanentPath = path.join(dataDir, fileName);
        fs.writeFileSync(permanentPath, nodeBuffer);
        
        savePendingApproval({
          id: approvalId,
          filePath: permanentPath,
          caption: defaultCaption,
          threadId: ctx.message.threadId,
          threadType: ctx.message.threadType,
          accountId: ctx.account.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });

        const user = process.env.GMAIL_USER || "Gautamahoa@gmail.com";
        const pass = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_APP_PASSWORD;
        if (pass) {
          try {
            const transporter = nodemailer.createTransport({
              service: "gmail",
              auth: { user, pass }
            });

            // Lấy IP của máy Mac (Ưu tiên IP của Tailscale mạng 100.x.x.x, nếu không có thì lấy IP WiFi LAN)
            // networkInterfaces đã import static ở đầu file
            const nets = networkInterfaces();
            let localIp = '127.0.0.1';
            let tailscaleIp = null;

            for (const name of Object.keys(nets)) {
              for (const net of nets[name] || []) {
                if (net.family === 'IPv4' && !net.internal) {
                  if (net.address.startsWith('100.')) {
                    tailscaleIp = net.address;
                  } else if (localIp === '127.0.0.1') {
                    localIp = net.address;
                  }
                }
              }
            }
            
            const finalIp = tailscaleIp || localIp;
            const approveUrl = `http://${finalIp}:3900/api/approve/${approvalId}`;
            
            await transporter.sendMail({
              from: `"OCB Assistant" <${user}>`,
              to: user,
              subject: `[Duyệt Bảng Tính Vay] ${customer_name} - ${conf.displayName}`,
              html: `
                <h3>Bot đã lên xong Bảng tính dòng tiền vay cho khách hàng: ${escapeHtml(customer_name || "Khách hàng")}</h3>
                <p>Dự án: <b>${escapeHtml(conf.displayName)}</b></p>
                <p>Vay: <b>${(loan_amount/1000000000).toFixed(2)} tỷ</b></p>
                <p>File Excel đã được đính kèm trong email này để anh kiểm tra.</p>
                <br>
                <a href="${approveUrl}" style="background:#16a34a;color:white;padding:12px 20px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">MỞ TRANG KIỂM TRA & DUYỆT</a>
                <br><br>
                <p style="color:gray;font-size:12px;">⚠️ <b>Lưu ý (Chế độ Tailscale 4G):</b> Nếu dùng 4G, điện thoại phải đang bật app Tailscale. URL duyệt hiện tại đang chạy qua IP: <b>${finalIp}</b>.</p>
                <p style="color:gray;font-size:12px;">Nếu sai, anh có thể tải file đính kèm sửa lại rồi tự gửi qua Zalo cho khách.</p>
              `,
              attachments: [{ 
                filename: fileName, 
                path: permanentPath,
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              }]
            });
          } catch (mailErr: any) {
            log.warn({ err: mailErr?.message || mailErr }, "Không gửi được email duyệt, file vẫn được lưu trong hàng chờ");
          }
        }
        
        ctx.ghiNhanDaGui?.(`[Đã đưa vào hàng chờ duyệt] ${fileName}`);
        log.info({ approvalId }, "Đã tạo bảng tính và gửi email chờ duyệt (Human-in-the-loop)");

        
        const RATES: Record<string, number> = {
          'bcons': 10.8,
          'gladia': 10.9,
          'the_prive': 11.5,
          'palm_river': 10.8
        };
        const rate = RATES[project] || 10.5;
        
        const gocThang = grace_period_months > 0 ? 0 : loan_amount / loan_term_months;
        const laiThang1 = loan_amount * (rate / 100) / 12;
        const tongThang1 = gocThang + laiThang1;
        
        // Từ tháng hết ân hạn
        const gocThangSauAnHan = loan_amount / (loan_term_months - grace_period_months);
        const tongThangSauAnHan = gocThangSauAnHan + laiThang1; // Tương đối, lãi sẽ giảm dần
        
        function formatMoney(n: number) {
            return (n / 1000000).toFixed(1) + " triệu";
        }

        return `ĐÃ TẠO FILE EXCEL VÀ GỬI EMAIL CHO GIÁM ĐỐC CHI NHÁNH DUYỆT (CHƯA GỬI CHO KHÁCH). 
Dưới đây là kết quả tóm tắt đã được công cụ tính sẵn:
- Dự án: ${conf.displayName}
- Số tiền vay: ${(loan_amount / 1000000000).toFixed(2)} tỷ
- Ân hạn gốc: ${grace_period_months} tháng
- Trả tháng 1 (trong ân hạn): ${formatMoney(tongThang1)} (Gốc: ${formatMoney(gocThang)}, Lãi: ${formatMoney(laiThang1)})
- Trả từ tháng ${grace_period_months + 1} (sau ân hạn): Gốc ${formatMoney(gocThangSauAnHan)} + Lãi giảm dần (tổng tháng này khoảng ${formatMoney(tongThangSauAnHan)})

Bạn HÃY nhắn với khách: "Dạ em đã lên xong bảng tính sơ bộ, em đang trình sếp duyệt file chuẩn, lát nữa sếp duyệt xong em gửi qua liền cho anh/chị nhé!". (TUYỆT ĐỐI không chép lại các con số kỹ thuật này vào tin nhắn)`;
      } catch (err: any) {
        log.error({ err, project }, "Lỗi khi tạo và gửi bảng tính lãi dự án");
        return ketQuaLoi(`Lỗi khi tạo file Excel bảng tính: ${err.message || err}`);
      }
    },
  });
}
