import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { MemoryContext } from "../conversation/memory-store.js";
import { dataDir } from "../config/env.js";

// ---------------------------------------------------------------------------
// Dynamic KB Router
// ---------------------------------------------------------------------------
// Thay vì nạp nguyên khối ~3.550 token persona mỗi lượt, module này chỉ nạp
// core-persona.md (~400 token) + tối đa MAX_DYNAMIC_KBS module KB liên quan
// (~150-350 token mỗi module) dựa trên nội dung tin nhắn và label thread.
//
// Tiết kiệm ước tính: ~70% token persona mỗi turn.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNTIME_PERSONAS_DIR = resolve(dataDir, "personas");
const BUNDLED_PERSONAS_DIR = resolve(__dirname, "../../personas");

/** Đường dẫn tới file core persona (luôn load) */
const personaPaths = (filename: string): string[] => [
  resolve(RUNTIME_PERSONAS_DIR, filename),
  resolve(BUNDLED_PERSONAS_DIR, filename),
];

/** Số lượng Dynamic KB tối đa mỗi lượt */
const MAX_DYNAMIC_KBS = 3;

/** Một module KB có thể được inject động */
export interface DynamicKBModule {
  /** Tên file trong thư mục personas (vd: 'kb-mortgage.md') */
  file: string;
  /** Nhãn mô tả ngắn (dùng cho log/trace) */
  label: string;
  /** Độ ưu tiên: label_match > keyword_match > time_trigger */
  priority: "label_match" | "keyword_match" | "time_trigger";
}

// ---------------------------------------------------------------------------
// Keyword maps cho từng KB module
// ---------------------------------------------------------------------------
interface KBRule {
  file: string;
  label: string;
  /** Labels khớp → ưu tiên cao (label_match) */
  labelTriggers: string[];
  /** Keywords khớp → ưu tiên trung bình (keyword_match) */
  keywords: RegExp;
}

const KB_RULES: KBRule[] = [
  {
    file: "kb-townhouse.md",
    label: "KB11: Nhà phố / Đất nền",
    labelTriggers: [],
    keywords:
      /(nhà phố|đất nền|nhà riêng|biệt thự|sổ hồng|sổ đỏ|thổ cư|đất ở|định giá|thẩm định|lộ giới|quy hoạch|giải chấp|chuyển nợ|sang tên|công chứng|ranh đất|giấy phép xây dựng|hoàn công|đất nông nghiệp|nhà cấp 4|mặt tiền|hẻm|kiệt)/i,
  },
  {
    file: "kb-mortgage.md",
    label: "KB1: Vay mua nhà",
    labelTriggers: ["Khách hàng vay"],
    keywords:
      /(vay|mua nhà|căn hộ|lãi suất|gốc lãi|dòng tiền|bảng tính|dti|ltv|palm|privé|prive|gladia|bcons|dự án|thế chấp|kỳ hạn|trả nợ|giải ngân|ân hạn|mortgage)/i,
  },
  {
    file: "kb-broker.md",
    label: "KB2: Môi giới BĐS",
    labelTriggers: ["Môi giới BĐS"],
    keywords:
      /(khách của em|khách của anh|hoa hồng|phí đẩy|check cic|cic|tbpd|nộp cđt|booking|lock căn|f1|f2|giỏ hàng|sale|môi giới|sàn giao dịch|training|event)/i,
  },
  {
    file: "kb-credit-card.md",
    label: "KB3: Thẻ tín dụng",
    labelTriggers: [],
    keywords:
      /(thẻ tín dụng|mở thẻ|hạn mức thẻ|hoàn tiền|cashback|platinum|lifestyle|igen|jcb|world 2in1|sao kê lương|thẻ ocb|credit card)/i,
  },
  {
    file: "kb-objections.md",
    label: "KB9: Xử lý từ chối",
    labelTriggers: [],
    keywords:
      /(lãi cao|lãi suất cao|ngân hàng khác|rẻ hơn|suy nghĩ thêm|để suy nghĩ|đắt quá|không đủ tiền|xa quá|kẹt xe|chưa có nhu cầu|từ chối|không cần|thôi em|thôi anh|để sau)/i,
  },
  {
    file: "kb-loan-policies.md",
    label: "KB10: Phí & Bảo hiểm",
    labelTriggers: [],
    keywords:
      /(bảo hiểm|bhnt|cháy nổ|phí phạt|trả trước hạn|tất toán|lãi thả nổi|biên độ|lscs|trước hạn)/i,
  },
  {
    file: "kb-situations.md",
    label: "KB4-8: Tình huống",
    labelTriggers: [],
    keywords:
      /(cà phê|cafe|gặp mặt|hẹn gặp|ghé qua|chi nhánh ở đâu|có phải bot|gọi điện|cho số đt|nói chuyện trực tiếp|gặp người thật|bức xúc|khiếu nại|thất vọng|làm ăn kiểu gì|phàn nàn)/i,
  },
  {
    file: "kb-deposit.md",
    label: "KB12: Tiền gửi & Tiết kiệm OCB",
    labelTriggers: ["Khách hàng Tiền gửi", "Khách hàng Tiết kiệm", "Khách hàng CCTG", "Khách gửi tiền"],
    keywords:
      /(tiết kiệm|tiền gửi|chứng chỉ tiền gửi|cctg|sinh lời|max savings|flexi savings|huy động|gửi tiền|sổ tiết kiệm|lãi suất gửi|mở sổ|lãi suất tiết kiệm)/i,
  },
];

const fileCache = new Map<string, string>();

function readKBFile(filename: string): string {
  const cached = fileCache.get(filename);
  if (cached !== undefined) return cached;

  for (const filepath of personaPaths(filename)) {
    try {
      const content = readFileSync(filepath, "utf-8").trim();
      fileCache.set(filename, content);
      return content;
    } catch {
      // Thử runtime override trước, rồi mới tới bản mặc định đóng gói.
    }
  }
  return "";
}

/**
 * Đọc core persona (luôn nạp vào system prompt)
 */
export function readCorePersona(): string {
  const cached = fileCache.get("core-persona.md");
  if (cached !== undefined) return cached;

  return readKBFile("core-persona.md");
}

export interface DynamicKBContext {
  /** Nội dung batch tin nhắn mới (text đã ghép) */
  latestMessages: string[];
  /** Labels đã gắn cho thread (từ assign_label) */
  threadLabels?: string[];
  /** Memory facts đã lưu về khách */
  memoryFacts?: MemoryContext;
  /** Thời gian (ms) từ tin nhắn trước của khách trong thread */
  lastCustomerMsgAgeMs?: number;
}

/**
 * Giải quyết danh sách Dynamic KB cần inject vào system prompt.
 *
 * @returns Mảng nội dung KB đã đọc từ file, sắp xếp theo ưu tiên
 */
export function resolveDynamicKBs(ctx: DynamicKBContext): {
  contents: string[];
  matched: DynamicKBModule[];
} {
  const combinedText = ctx.latestMessages.join(" ").toLowerCase();
  const labels = (ctx.threadLabels ?? []).map((l) => l.toLowerCase());

  // Thêm context từ memory facts
  const factsText = ctx.memoryFacts
    ? ctx.memoryFacts
        .map((f) =>
          typeof f === "string" ? f : "content" in f ? f.content : "",
        )
        .join(" ")
        .toLowerCase()
    : "";

  const matches: DynamicKBModule[] = [];

  for (const rule of KB_RULES) {
    // Check label match (highest priority)
    const labelMatch = rule.labelTriggers.some((trigger) =>
      labels.includes(trigger.toLowerCase()),
    );
    if (labelMatch) {
      matches.push({
        file: rule.file,
        label: rule.label,
        priority: "label_match",
      });
      continue;
    }

    // Check keyword match in messages
    if (rule.keywords.test(combinedText)) {
      matches.push({
        file: rule.file,
        label: rule.label,
        priority: "keyword_match",
      });
      continue;
    }

    // Check keyword match in memory facts (lower signal)
    if (factsText && rule.keywords.test(factsText)) {
      matches.push({
        file: rule.file,
        label: rule.label,
        priority: "keyword_match",
      });
    }
  }

  // Time-based trigger: KB6 (khách quay lại sau >48h)
  if (
    ctx.lastCustomerMsgAgeMs &&
    ctx.lastCustomerMsgAgeMs > 48 * 60 * 60 * 1000
  ) {
    const alreadyHasSituations = matches.some(
      (m) => m.file === "kb-situations.md",
    );
    if (!alreadyHasSituations) {
      matches.push({
        file: "kb-situations.md",
        label: "KB6: Khách quay lại",
        priority: "time_trigger",
      });
    }
  }

  // Sort by priority: label_match > keyword_match > time_trigger
  const priorityOrder = { label_match: 0, keyword_match: 1, time_trigger: 2 };
  matches.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Limit to MAX_DYNAMIC_KBS
  const selected = matches.slice(0, MAX_DYNAMIC_KBS);

  // Read file contents
  const contents = selected
    .map((m) => readKBFile(m.file))
    .filter((c) => c.length > 0);

  return { contents, matched: selected };
}

/**
 * Xóa cache file (dùng trong test hoặc khi cần reload)
 */
export function clearKBCache(): void {
  fileCache.clear();
}
