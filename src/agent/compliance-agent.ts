import { generateObject } from "ai";
import { z } from "zod";
import { resolveLanguageModel } from "./llm-provider.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("compliance-agent");

// ─────────────────── HEURISTIC RISK TRIGGERS ───────────────────
// Quy tắc 1: Cấm cam kết chắc chắn 100% giải ngân mà không thẩm định
const RISK_COMMITMENT_REGEX =
  /(chắc chắn\s*(được|vay|duyệt|giải ngân|100%)|cam kết\s*(được|vay|duyệt|giải ngân|100%)|đảm bảo\s*(được|vay|duyệt|giải ngân|100%)|100%\s*(duyệt|đậu|được vay|giải ngân)|bao đậu|bao duyệt|chắc cú|chắc ăn|yên tâm duyệt|không cần thẩm định|chắc chắn 100%)/i;

// Quy tắc 2: Cấm hứa hẹn lãi suất cố định vĩnh viễn không rào trước
const RISK_ABSOLUTE_RATE_REGEX =
  /(cố định suốt|cố định mãi|không bao giờ đổi|cố định toàn bộ thời gian vay)/i;
const INTEREST_REGEX =
  /(lãi suất|lãi ưu đãi|lãi thả nổi|%\s*(mỗi|hàng|\/)?\s*(năm|tháng)|lscs)/i;
const CAVEAT_REGEX =
  /(tham khảo|tùy|dự kiến|từng thời kỳ|tạm tính|thẩm định|chính sách|thay đổi|thả nổi|khoảng|ước tính|phòng thẩm định)/i;

// Quy tắc 3: Cấm gian lận, khai khống, bùa hồ sơ, vay nóng
const RISK_FRAUD_REGEX =
  /(làm giả|khai khống|bùa hồ sơ|lách luật|chế bảng lương|chế sao kê|bảng lương giả|du di cho|vay nóng|tín dụng đen|xã hội đen)/i;

export async function runComplianceGuard(text: string): Promise<{ approved: boolean; rewrittenText: string; reason: string }> {
  // 1. Bỏ qua nếu tin nhắn quá ngắn (thường là chào hỏi như "Dạ", "Vâng ạ")
  if (text.length < 15) {
    return { approved: true, rewrittenText: text, reason: "Tin nhắn ngắn (<15 ký tự)" };
  }

  // 2. HEURISTIC CASCADING CHECK:
  // Phát hiện xem có dấu hiệu rủi ro thuộc 3 quy tắc ngân hàng hay không
  const hasCommitmentRisk = RISK_COMMITMENT_REGEX.test(text);
  const hasFraudRisk = RISK_FRAUD_REGEX.test(text);
  const hasAbsoluteRate = RISK_ABSOLUTE_RATE_REGEX.test(text);
  const mentionsInterest = INTEREST_REGEX.test(text);
  const hasCaveat = CAVEAT_REGEX.test(text);

  // Nếu nhắc đến lãi suất mà CHƯA có câu rào chắn an toàn -> Cần LLM kiểm tra
  const interestNeedsAudit = mentionsInterest && !hasCaveat;

  const requiresLLMAudit =
    hasCommitmentRisk || hasFraudRisk || hasAbsoluteRate || interestNeedsAudit;

  // Nếu hoàn toàn an toàn (không dính từ khóa cấm, lãi suất đã có rào chắn hoặc không bàn lãi suất):
  // PASS NGAY LẬP TỨC (0ms, 0 Token, 0đ)
  if (!requiresLLMAudit) {
    log.debug({ textLength: text.length }, "Compliance Heuristic Pass: Tin nhắn an toàn, bỏ qua LLM");
    return {
      approved: true,
      rewrittenText: text,
      reason: "Heuristic Pass: Không phát hiện từ khóa rủi ro pháp lý & cam kết",
    };
  }

  log.info(
    { hasCommitmentRisk, hasFraudRisk, hasAbsoluteRate, interestNeedsAudit },
    "Compliance Guard: Phát hiện nghi vấn rủi ro -> Kích hoạt LLM Audit",
  );

  const model = resolveLanguageModel({
    modelProvider: "google",
    modelName: "gemini-3.6-flash",
  });

  try {
    const result = await generateObject({
      model,
      schema: z.object({
        approved: z.boolean().describe("True nếu tin nhắn an toàn. False nếu có dấu hiệu cam kết sai quy định hoặc rủi ro pháp lý."),
        reason: z.string().describe("Lý do duyệt hoặc từ chối."),
        rewrittenText: z.string().describe("Nếu False, hãy viết lại tin nhắn cho an toàn (thêm câu rào chữ 'tùy thuộc vào hồ sơ' hoặc gỡ bỏ cam kết). BẮT BUỘC giữ nguyên toàn bộ cấu trúc xuống dòng và các gạch đầu dòng (-). Nếu True, trả về y nguyên bản gốc.")
      }),
      system: `Bạn là KIỂM SOÁT VIÊN RỦI RO (Compliance Agent) của ngân hàng OCB.
Nhiệm vụ: Duyệt tin nhắn của AI Agent trước khi gửi cho khách hàng.

3 QUY TẮC PHÁP LÝ NGÂN HÀNG BẮT BUỘC:
1. KHÔNG BAO GIỜ được cam kết chắc chắn 100% giải ngân ("Chắc chắn vay được", "Đảm bảo duyệt"). Mọi khoản vay đều phải thẩm định.
2. KHÔNG BAO GIỜ hứa hẹn mức lãi suất cố định vĩnh viễn mà không rào trước (VD: "Lãi suất 7.5% nhé" -> phải là "Lãi suất tham khảo 7.5%, có thể thay đổi tùy chính sách từng thời kỳ").
3. KHÔNG KHUYÊN khách hàng khai khống, vay mượn nóng bên ngoài, hoặc làm giả giấy tờ.

QUY TẮC BẢO TOÀN ĐỊNH DẠNG (BẮT BUỘC):
- TUYỆT ĐỐI GIỮ NGUYÊN cấu trúc xuống dòng, từng gạch đầu dòng (-) và cách dòng của tin nhắn gốc.
- TUYỆT ĐỐI KHÔNG gom các gạch đầu dòng hay các đoạn văn lại thành 1 dòng duy nhất!
- Nếu thêm câu rào (Lưu ý:...), hãy đặt câu lưu ý ở MỘT DÒNG RIÊNG BIỆT.

Hãy phân tích tin nhắn sau và kiểm tra xem có vi phạm quy tắc trên không.`,
      prompt: `Tin nhắn cần kiểm duyệt:\n\n"${text}"`,
    });

    if (!result.object.approved) {
      log.warn({ reason: result.object.reason, original: text, rewritten: result.object.rewrittenText }, "Compliance Agent đã can thiệp và sửa đổi tin nhắn!");
    }

    return result.object;
  } catch (error) {
    log.error({ error }, "Lỗi khi chạy Compliance Agent, cho phép pass fallback");
    // Fallback: nếu lỗi API, cứ cho qua để không sập luồng
    return { approved: true, rewrittenText: text, reason: "Fallback due to error" };
  }
}
