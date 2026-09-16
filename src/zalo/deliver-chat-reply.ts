import { appendMessage } from "../conversation/history-store.js";
import { createLogger } from "../shared/logger.js";
import { dinhDangNeuBat, lamSachTheoCauHinh } from "./prepare-outgoing-text.js";
import { notifyTechnicalError, sendReplyInParts, type ReplyTarget } from "./send-reply-in-parts.js";

/**
 * Giao câu trả lời của agent xuống Zalo cho lượt chat THƯỜNG: làm sạch -> gửi
 * -> ghi history.
 *
 * Tách khỏi `message-turn-processor.ts` vì đó là phần ĐIỀU PHỐI cả lượt (mở
 * lượt, lưu ảnh, chốt usage, lưu trace, nhánh lỗi) - còn đây là một việc gọn:
 * biến chữ của model thành tin trên Zalo. File kia đã vượt ngưỡng 200 dòng khi
 * lớp làm sạch nối vào.
 *
 * KHÔNG dùng chung với scheduler: lượt theo lịch có luật `[SILENT]` riêng phải
 * chạy TRƯỚC bước làm sạch, và job hỏng thì im chứ không nhắn câu lỗi.
 */

const log = createLogger("message-turn");

export type KetQuaGiao = {
  /** Chữ THẬT SỰ đã tới Zalo - rỗng khi bị chặn hoặc không gửi được gì */
  daGui: string;
  /** Bị chặn vì rò system prompt, hoặc gửi hỏng giữa chừng */
  hong: boolean;
};

/**
 * Chuẩn hóa các gạch đầu dòng (-) và câu lưu ý thành từng dòng riêng biệt
 * Chữa triệt để tình trạng model viết dồn dập các gạch đầu dòng trên cùng một dòng
 */
export function formatCleanBulletLines(text: string): string {
  // 1. Tách gạch đầu dòng sau dấu hai chấm hoặc sau dấu ngắt câu: ": -" -> ":\n- ", ". -" -> ".\n- "
  let t = text.replace(/(:\s*|[.!?]\s+)-\s+/g, (m, p) => p.trim() + "\n- ");
  // 2. Tách gạch đầu dòng sau dấu đóng ngoặc: ")... - " -> ")\n- "
  t = t.replace(/\)\s*-\s+/g, ")\n- ");
  // 3. Tách câu Lưu ý thành dòng riêng thoáng mắt: "...! (Lưu ý:" -> "...!\n\n(Lưu ý:"
  t = t.replace(/([.!?])\s*(\([Ll]ưu ý:)/g, "$1\n\n$2");
  // 4. Tách câu hỏi / kết luận sau câu lưu ý hoặc đoạn trong ngoặc đóng câu: "...). Sếp..." -> "...).\n\nSếp..."
  t = t.replace(/(\)[.!?]+|\.\))\s+([A-ZÀ-Ỹ0-9])/g, "$1\n\n$2");
  // 5. Tách câu hỏi kết luận / chốt hạ ở cuối gạch đầu dòng cuối cùng nếu bị dính liền
  t = t.replace(/(-\s+[^\n]+?\.)\s+([A-ZÀ-Ỹ0-9][^\n]+?[?!😊🤝✨])/g, "$1\n\n$2");
  // 6. Chuẩn hóa không để vượt quá 2 dấu xuống dòng liên tiếp
  t = t.replace(/\n{3,}/g, "\n\n");
  return t;
}

export async function deliverChatReply(
  target: ReplyTarget,
  accountId: string,
  threadId: string,
  text: string,
): Promise<KetQuaGiao> {
  // Chuẩn hóa cấu trúc xuống dòng cho các gạch đầu dòng và lưu ý
  text = formatCleanBulletLines(text);
  // Lớp làm sạch CUỐI trước khi chữ ra Zalo. Hai đường khác nhau ở chỗ dấu
  // markdown bị XÓA hay được DỊCH thành định dạng thật của Zalo; lá chắn rò
  // system prompt và luật `[SILENT]` thì cả hai đều có.
  const sach = lamSachTheoCauHinh(text);

  if (sach.chan) {
    // Câu trả lời rò system prompt. Cắt bớt rồi gửi phần còn lại là gửi nửa
    // vời - không ai biết phần nào còn rò. Chặn hẳn, báo lỗi kỹ thuật.
    // 200 ký tự đầu để chẩn đoán, KHÔNG đổ nguyên prompt vào file log.
    log.error({ dauText: text.slice(0, 200) }, "Chặn câu trả lời rò system prompt - không gửi");
    await notifyTechnicalError(target);
    return { daGui: "", hong: true };
  }

  if (sach.daSua.length > 0) {
    // Sửa chữ của model rồi im lặng là tự bịt mắt mình lúc chẩn đoán
    log.warn({ daSua: sach.daSua }, "Đã làm sạch câu trả lời trước khi gửi");
  }

  const parts = sach.text.split('|||');
  let finalDelivered = "";
  let hasError = false;

  for (let i = 0; i < parts.length; i++) {
    const pText = parts[i].trim();
    if (!pText) continue;

    const { text: chuGui, styles } = dinhDangNeuBat(pText);
    
    if (!chuGui.trim()) continue;

    const reply = await sendReplyInParts(target, chuGui, styles);
    
    if (reply.deliveredText) {
      appendMessage(accountId, threadId, { role: "assistant", content: reply.deliveredText });
      finalDelivered += (finalDelivered ? "\n" : "") + reply.deliveredText;
    }

    if (reply.error) {
      await notifyTechnicalError(target);
      hasError = true;
      break;
    }
  }

  return { daGui: finalDelivered, hong: hasError };
}
