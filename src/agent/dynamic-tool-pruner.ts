import type { Tool } from "ai";
import { createLogger } from "../shared/logger.js";
import type { ParsedMessage } from "../zalo/zalo-message-parser.js";

const log = createLogger("tool-pruner");

// Regex phát hiện ý định liên quan tới các tool nặng/văn phòng
const WORD_INTENT_REGEX =
  /(file\s*word|văn bản|soạn thảo|tạo\s*doc|\.docx|xuất\s*word|làm\s*thông báo|làm\s*công văn)/i;
const EXCEL_INTENT_REGEX =
  /(file\s*excel|bảng tính|tính excel|bảng số liệu|\.xlsx|xuất\s*excel|lập\s*bảng|bảng kê)/i;
const IMAGE_INTENT_REGEX =
  /(vẽ ảnh|tạo ảnh|sửa ảnh|chế ảnh|vẽ hình|gen ảnh|generate image|design ảnh)/i;

export interface PruneToolsOptions {
  isGroup: boolean;
  batch: ParsedMessage[];
}

/**
 * Cắt tỉa danh sách tools gửi lên model dựa theo ngữ cảnh:
 * 1. Nếu là chat cá nhân 1-1: Loại bỏ các tool dành riêng cho nhóm (get_group_info, tag_member).
 * 2. Các tool văn phòng nặng (create_word_document, create_excel_file, create_image):
 *    Chỉ nạp khi khách hàng có ý định yêu cầu tạo/sửa file hoặc vẽ ảnh.
 *
 * Tiết kiệm: 1.500 - 2.500 token schema mỗi lượt, giảm tool confusion.
 */
export function pruneToolsForTurn(
  tools: Record<string, Tool>,
  options: PruneToolsOptions,
): { prunedTools: Record<string, Tool>; removedToolKeys: string[] } {
  const { isGroup, batch } = options;
  const prunedTools: Record<string, Tool> = { ...tools };
  const removedToolKeys: string[] = [];

  // Gộp text của toàn bộ tin nhắn trong batch hiện tại
  const fullBatchText = batch.map((m) => m.text || "").join(" ");

  // 1. Phân loại kênh chat: Nếu là chat 1-1, bỏ group tools
  if (!isGroup) {
    if (prunedTools.get_group_info) {
      delete prunedTools.get_group_info;
      removedToolKeys.push("get_group_info (1-1 chat)");
    }
    if (prunedTools.tag_member) {
      delete prunedTools.tag_member;
      removedToolKeys.push("tag_member (1-1 chat)");
    }
  }

  // 2. Lazy-load tool tạo file Word: chỉ nạp khi có intent
  if (prunedTools.create_word_document && !WORD_INTENT_REGEX.test(fullBatchText)) {
    delete prunedTools.create_word_document;
    removedToolKeys.push("create_word_document (no intent)");
  }

  // 3. Lazy-load tool tạo file Excel: chỉ nạp khi có intent
  if (prunedTools.create_excel_file && !EXCEL_INTENT_REGEX.test(fullBatchText)) {
    delete prunedTools.create_excel_file;
    removedToolKeys.push("create_excel_file (no intent)");
  }

  // 4. Lazy-load tool vẽ ảnh AI: chỉ nạp khi có intent
  if (prunedTools.create_image && !IMAGE_INTENT_REGEX.test(fullBatchText)) {
    delete prunedTools.create_image;
    removedToolKeys.push("create_image (no intent)");
  }

  if (removedToolKeys.length > 0) {
    log.info(
      {
        totalBefore: Object.keys(tools).length,
        totalAfter: Object.keys(prunedTools).length,
        prunedCount: removedToolKeys.length,
        pruned: removedToolKeys,
      },
      "Dynamic Tool Pruning: Đã cắt tỉa bớt các tools không cần thiết cho lượt này",
    );
  }

  return { prunedTools, removedToolKeys };
}
