import { tool } from "ai";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../../config/env.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger("notebooklm");

// ─────────────────── MCP CONNECTION POOL ───────────────────
let mcpClient: Client | null = null;
let mcpTransport: StdioClientTransport | null = null;
let connectingPromise: Promise<Client> | null = null;
let consecutiveFailures = 0;

/** Ngân sách cho TOÀN BỘ connect + query, không nhân đôi theo từng bước. */
const MCP_TIMEOUT_MS = Number(process.env.NOTEBOOKLM_TIMEOUT_MS) || 8_000;
/** Sau bao nhiêu lỗi liên tiếp thì bỏ reconnect, chỉ dùng fallback */
const MAX_CONSECUTIVE_FAILURES = 3;
/** Thời điểm circuit breaker mở — cooldown trước khi thử lại MCP */
let circuitOpenUntil = 0;
/** Cooldown sau khi circuit breaker mở (ms) */
const CIRCUIT_COOLDOWN_MS = 5 * 60_000; // 5 phút

const NOTEBOOK_IDS =
  process.env.NOTEBOOK_IDS ||
  "47464149-ea6e-44c8-9a45-9d679343159d,6210de00-bedf-40b1-aabb-e14c279fceee,8e8bfed8-3052-43a4-abd2-796e82d43bdd,46028b98-6e7a-4750-a05b-14c03ecedf34,60a7e8f0-c8bb-40d6-bc58-dc2034fb660e,c3af3e9c-496e-4c3c-ae56-944f2dc7b615,d365139a-9a7e-4e3d-8add-008e69eb0c30";

const MCP_COMMAND =
  process.env.NOTEBOOKLM_MCP_COMMAND ||
  "notebooklm-mcp";

const MCP_CLI_PATH = process.env.NOTEBOOKLM_MCP_CLI_PATH;

function subprocessEnv(): Record<string, string> {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  if (MCP_CLI_PATH) clean.NOTEBOOKLM_MCP_CLI_PATH = MCP_CLI_PATH;
  return clean;
}

// ─────────────────── GRACEFUL DISCONNECT ───────────────────
function killMcpClient() {
  try {
    mcpClient?.close();
  } catch { /* ignore */ }
  try {
    mcpTransport?.close();
  } catch { /* ignore */ }
  mcpClient = null;
  mcpTransport = null;
  connectingPromise = null;
}

// ─────────────────── CONNECT / RECONNECT ───────────────────
async function getMcpClient(): Promise<Client> {
  // Circuit breaker: nếu đang trong cooldown, không thử kết nối
  if (Date.now() < circuitOpenUntil) {
    throw new Error(`Circuit breaker open — thử lại sau ${Math.ceil((circuitOpenUntil - Date.now()) / 1000)}s`);
  }

  // Đã có client sống
  if (mcpClient) return mcpClient;

  // Đang kết nối (tránh race condition nếu 2 lượt gọi cùng lúc)
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    log.info("Đang kết nối MCP NotebookLM subprocess...");
    killMcpClient(); // clean up trước

    mcpTransport = new StdioClientTransport({
      command: MCP_COMMAND,
      args: [],
      env: subprocessEnv(),
    });

    const client = new Client(
      { name: "zalo-agent", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(mcpTransport);
    mcpClient = client;
    connectingPromise = null;
    log.info("Kết nối MCP NotebookLM thành công");
    return client;
  })().catch((err) => {
    connectingPromise = null;
    killMcpClient();
    throw err;
  });

  return connectingPromise;
}

// ─────────────────── TIMEOUT WRAPPER ───────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout sau ${ms}ms`));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ─────────────────── LOCAL-FIRST KNOWLEDGE GRAPH SEARCH ───────────────────
function stripAccents(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

/**
 * Tra cứu nhanh trong SQLite Knowledge Graph (<10ms).
 * Trả về kết quả nếu khớp thực thể xác định (dự án cụ thể, thẻ tín dụng, quy định cốt lõi).
 * Trả về null nếu câu hỏi mang tính ngữ nghĩa mở hoặc ngoài danh mục cấu trúc.
 */
function queryKnowledgeGraphFast(query: string): string | null {
  const dbPath = path.join(dataDir, "banking-graph.db");
  let db: DatabaseSync | null = null;
  try {
    if (!fs.existsSync(dbPath)) return null;
    db = new DatabaseSync(dbPath, { readOnly: true });
    const lowerQ = query.toLowerCase();
    const normQ = stripAccents(query);

    // 0. Kiểm tra câu hỏi tổng quan về QĐ 693 / Dự án chiến lược Đợt 7
    const isQd693Query =
      /(qd 693|693\.01|693|đợt 7|dự án chiến lược|các dự án chiến lược|bất động sản chiến lược|danh sách dự án)/i.test(lowerQ) ||
      /(qd 693|693\.01|dot 7|du an chien luoc|bat dong san chien luoc|danh sach du an)/i.test(normQ);
    if (isQd693Query) {
      const qd693Attrs = db.prepare(
        "SELECT key, value FROM attributes WHERE entity_id = 'reg_ocb_lending_qd693'",
      ).all() as any[];
      if (qd693Attrs.length > 0) {
        const attrMap = Object.fromEntries(qd693Attrs.map((a) => [a.key, a.value]));
        return [
          `📊 [Dữ liệu từ Knowledge Graph nội bộ - Tốc độ cao <10ms]`,
          `🏛️ CHƯƠNG TRÌNH LÃI SUẤT CHO VAY BĐS DỰ ÁN CHIẾN LƯỢC OCB 2026 (ĐỢT 7) - ${attrMap.so_quyet_dinh || "QĐ 693.01/2026/QĐ-TGĐ"}:`,
          `• Hiệu lực: ${attrMap.hieu_luc || "15/09/2026 - 31/12/2026"} (Hạn mức: ${attrMap.han_muc || "2.500 tỷ đồng"})`,
          `• Lãi suất cơ sở (LSCS): ${attrMap.lai_suat_co_so || "LSCS 13 tháng OCB"}`,
          `• Chu kỳ điều chỉnh lãi sau ưu đãi: ${attrMap.chu_ky_dieu_chinh || "6 tháng/lần"}`,
          `• Cơ chế phí TNTH chung: ${attrMap.co_che_thu_phi_tnth_chung || "N/A"}`,
          `\n🏠 4 DỰ ÁN CHIẾN LƯỢC TRỌNG TÂM:`,
          `• The Privé: 11.50%/năm (CĐ 24T), Biên độ LSCS + 3.3%, Phạt Y1-3: 2.5%, Y4: 1.5%, Y5: 1.0%, từ Y6: 0%. HHMG: 0.2% (Mã 1049)`,
          `• Gladia by the Waters: 10.90%/năm (CĐ 24T), Biên độ LSCS + 3.0%, Phạt Y1-2: 1.5%, Y3: 2.5%, Y4-5: 1.5%, từ Y6: 0%. HHMG: 0.2% (Mã 1048)`,
          `• Bcons Group: 18M: 10.70%, 24M: 10.80%, 36M: 11.50%, Biên độ LSCS + 3.3%, HHMG: 0.2% (Mã 1030, 1031, 1032)`,
          `• Palm City: 10.80%/năm (CĐ 24T), Biên độ LSCS + 3.5%, Tặng thẻ World <= 400tr + TK số đẹp đến 3 tỷ. (Mã 1066)`,
        ].join("\n");
      }
    }

    // 1. Tìm dự án BĐS cụ thể khớp tên hoặc alias (Tập trung 4 dự án chiến lược)
    const projectAliases: Record<string, string[]> = {
      prj_the_prive: ["the prive", "the privé", "prive", "privé", "khải hoàn", "khai hoan", "đất xanh", "dat xanh", "cc1", "cc5"],
      prj_gladia: ["gladia", "gladia by the waters", "gladia heights", "khang điền", "khang dien", "bình trưng đông", "binh trung dong"],
      prj_bcons: ["bcons", "bcons city", "polaris", "solary", "bcons plaza", "uni valley", "center city", "bcons avenue", "phát khang", "phat khang"],
      prj_palm_river: ["palm city", "palm river", "nam rạch chiếc", "nam rach chiec", "palm heights", "palm residence"],
    };

    let matchedProjectId: string | undefined;
    for (const [pId, aliases] of Object.entries(projectAliases)) {
      if (
        aliases.some(
          (alias) =>
            lowerQ.includes(alias) ||
            normQ.includes(stripAccents(alias)) ||
            normQ.includes(alias),
        )
      ) {
        matchedProjectId = pId;
        break;
      }
    }

    const projects = db.prepare("SELECT * FROM entities WHERE type = 'PROJECT'").all() as any[];
    const matchedProject = matchedProjectId
      ? projects.find((p) => p.id === matchedProjectId)
      : projects.find((p) =>
          lowerQ.includes(p.name.toLowerCase()) ||
          normQ.includes(stripAccents(p.name)) ||
          lowerQ.includes(p.id.replace("prj_", "").replace(/_/g, " ")) ||
          normQ.includes(p.id.replace("prj_", "").replace(/_/g, " "))
        );

    if (matchedProject) {
      const relations = db.prepare(
        "SELECT target_id FROM relations WHERE source_id = ? AND relation_type = 'APPLIES_POLICY'",
      ).all(matchedProject.id) as any[];
      const policyId = relations[0]?.target_id;

      if (policyId) {
        const attrs = db.prepare(
          "SELECT key, value FROM attributes WHERE entity_id = ?",
        ).all(policyId) as any[];
        const attrMap = Object.fromEntries(attrs.map((a) => [a.key, a.value]));

        const lines = [
          `📊 [Dữ liệu từ Knowledge Graph nội bộ - Tốc độ cao <10ms]`,
          `🏠 Dự án: ${matchedProject.name} (QĐ 693.01/2026/QĐ-TGĐ Đợt 7)`,
          `• Chủ đầu tư: ${attrMap.chu_dau_tu || "N/A"}`,
          `• Lãi suất ưu đãi: ${attrMap.lai_suat_uu_dai || "N/A"}`,
          `• Thời gian ưu đãi: ${attrMap.thoi_gian_uu_dai || "N/A"}`,
          `• Ân hạn gốc: ${attrMap.an_han_goc || "N/A"}`,
          `• LTV tối đa: ${attrMap.LTV_toi_da || "N/A"}`,
          `• Thời hạn vay tối đa: ${attrMap.thoi_han_vay_max || "40 năm"}`,
          `• Lãi suất thả nổi sau ưu đãi: ${attrMap.lai_suat_tha_noi || "LSCS 13T + Biên độ (chu kỳ 6 tháng/lần)"}`,
          `• Phí phạt trả trước hạn: ${attrMap.phi_tra_truoc_han || "N/A"}`,
          `• Hoa hồng môi giới: ${attrMap.hoa_hong_moi_gioi || "N/A"}`,
        ];
        if (attrMap.ty_le_ban_cheo) lines.push(`• Tỷ lệ bán chéo tối thiểu: ${attrMap.ty_le_ban_cheo}`);
        if (attrMap.ma_khuyen_mai) lines.push(`• Mã khuyến mãi (T24): ${attrMap.ma_khuyen_mai}`);
        if (attrMap.goi_htls) lines.push(`• Gói HTLS CĐT: ${attrMap.goi_htls}`);
        if (attrMap.dac_quyen_qua_tang) lines.push(`• Đặc quyền & Quà tặng: ${attrMap.dac_quyen_qua_tang}`);
        if (attrMap.von_tu_co_min) lines.push(`• Vốn tự có tối thiểu: ${attrMap.von_tu_co_min}`);
        if (attrMap.luu_y) lines.push(`• Lưu ý: ${attrMap.luu_y}`);
        return lines.join("\n");
      }
    }

    // 2. Kiểm tra câu hỏi về Thẻ tín dụng OCB
    const isCreditCardQuery = /(thẻ tín dụng|mở thẻ|sang ngang|cashback|hoàn tiền|world 2in1|jcb|igen|lifestyle|doctor|phí thường niên|trả góp|hạn mức thẻ)/i.test(lowerQ);
    if (isCreditCardQuery) {
      const cardAttrs = db.prepare(
        "SELECT key, value FROM attributes WHERE entity_id = 'reg_ocb_credit_cards'",
      ).all() as any[];

      if (cardAttrs.length > 0) {
        const attrMap = Object.fromEntries(cardAttrs.map((a) => [a.key, a.value]));
        return [
          `📊 [Dữ liệu từ Knowledge Graph nội bộ - Tốc độ cao <10ms]`,
          `💳 CÁC DÒNG THẺ TÍN DỤNG OCB CHỦ LỰC:`,
          `${attrMap.cac_dong_the_chinh || "N/A"}`,
          `\n📋 ĐIỀU KIỆN MỞ THẺ CHUNG & KIỂM SOÁT RỦI RO:`,
          `• ${attrMap.dieu_kien_mo_the_chung || "N/A"}`,
          `\n🛠️ 4 PHƯƠNG THỨC XÉT CẤP HẠN MỨC:`,
          `${attrMap["4_phuong_thuc_mo_the"] || "N/A"}`,
          `\n🎁 CHÍNH SÁCH MIỄN/HOÀN PHÍ THƯỜNG NIÊN:`,
          `• ${attrMap.chinh_sach_mien_phi_thuong_nien || "N/A"}`,
          `\n🛍️ CHƯƠNG TRÌNH TRẢ GÓP 0%:`,
          `• ${attrMap.tra_gop_0_phan_tram || "N/A"}`,
        ].join("\n");
      }
    }

    // 2.1. Kiểm tra câu hỏi về Chương trình lãi suất cho vay theo phân khúc QĐ 617
    const isSegmentLoanQuery = /(lãi suất vay|lscv|gói vay|lãi suất cho vay|vay mua xe|vay tiêu dùng|vay sxkd|qd 617|617|phân khúc|aff|maf|mass|bán chéo)/i.test(lowerQ);
    if (isSegmentLoanQuery) {
      const qd617Attrs = db.prepare(
        "SELECT key, value FROM attributes WHERE entity_id = 'reg_ocb_lending_qd617'",
      ).all() as any[];

      if (qd617Attrs.length > 0) {
        const attrMap = Object.fromEntries(qd617Attrs.map((a) => [a.key, a.value]));
        return [
          `📊 [Dữ liệu từ Knowledge Graph nội bộ - Tốc độ cao <10ms]`,
          `💰 CHƯƠNG TRÌNH LÃI SUẤT CHO VAY THEO PHÂN KHÚC KHCN OCB (QĐ 617.01/2026/QĐ-TGĐ):`,
          `• Hiệu lực: ${attrMap.hieu_luc || "N/A"}`,
          `• Vay BĐS & SXKD trung dài hạn: ${attrMap.vay_bds_sxkd_trung_dai_han || "N/A"}`,
          `• Vay Mua xe & Tiêu dùng có TSBĐ: ${attrMap.vay_xe_va_tieu_dung_tsbd || "N/A"}`,
          `• Vay SXKD ngắn hạn: ${attrMap.vay_sxkd_ngan_han || "N/A"}`,
          `• Phí trả nợ trước hạn: ${attrMap.phi_tra_truoc_han || "N/A"}`,
          `• Cơ chế giảm thêm lãi suất bán chéo: ${attrMap.co_che_giam_lai_suat_ban_cheo || "N/A"}`,
        ].join("\n");
      }
    }

    // 3. Kiểm tra câu hỏi về Quy định vay vốn chung / Điều kiện / Hồ sơ / Địa bàn / Ân hạn gốc
    const isRegulationQuery = /(quy định|điều kiện|hồ sơ|giấy tờ|thủ tục|độ tuổi|bao nhiêu tuổi|thu nhập|lương|chứng minh|nợ xấu|cic|nhóm 3|nhóm 2|ltv|dti|tctd|giải ngân|phong tỏa|pháp lý|tài sản riêng|chứng từ|ân hạn|địa bàn|80km|bán kính|khoảng cách|kê khai)/i.test(lowerQ);
    if (isRegulationQuery) {
      const regAttrs = db.prepare(
        "SELECT key, value FROM attributes WHERE entity_id = 'reg_ocb_lending_core'",
      ).all() as any[];

      if (regAttrs.length > 0) {
        const attrMap = Object.fromEntries(regAttrs.map((a) => [a.key, a.value]));
        return [
          `📊 [Dữ liệu từ Knowledge Graph nội bộ - Tốc độ cao <10ms]`,
          `📜 CHÍNH SÁCH & ĐIỀU KIỆN TÍN DỤNG CỐT LÕI OCB:`,
          `• Độ tuổi vay: ${attrMap.dieu_kien_do_tuoi || "N/A"}`,
          `• Tỷ lệ cho vay (LTV): ${attrMap.ty_le_cho_vay_ltv || "N/A"}`,
          `• Thu nhập tối thiểu: ${attrMap.muc_thu_nhap_toi_thieu || "N/A"}`,
          `• Tỷ lệ trả nợ (DTI): ${attrMap.ty_le_dti_tra_no || "N/A"}`,
          `• Quy định nợ xấu & CIC: ${attrMap.lich_su_no_xau_cic || "N/A"}`,
          `• Giới hạn tổ chức tín dụng: ${attrMap.gioi_han_so_luong_tctd || "N/A"}`,
          `• Ân hạn gốc mới (TB 432.01/2026/TB-TGĐ): ${attrMap.thoi_gian_an_han_goc_tb432 || "N/A"}`,
          `• Địa bàn cấp tín dụng bán kính 80km (TB 432.01/2026): ${attrMap.dia_ban_cap_tin_dung_tb432 || "N/A"}`,
          `• Nguyên tắc kê khai thu nhập: ${attrMap.nguyen_tac_ke_khai_thu_nhap || "N/A"}`,
          `\n📁 DANH MỤC HỒ SƠ VAY VỐN CẦN CHUẨN BỊ:`,
          `1. Hồ sơ pháp lý cá nhân: ${attrMap.ho_so_phap_ly || "N/A"}`,
          `2. Hồ sơ mục đích vay: ${attrMap.ho_so_muc_dich_vay || "N/A"}`,
          `3. Hồ sơ tài sản bảo đảm: ${attrMap.ho_so_tai_san_bao_dam || "N/A"}`,
          `4. Hồ sơ chứng minh nguồn thu: ${attrMap.ho_so_chung_minh_nguon_thu || "N/A"}`,
          `• Cơ chế giải ngân: ${attrMap.co_che_giai_ngan || "N/A"}`,
        ].join("\n");
      }
    }

    // 4. Kiểm tra câu hỏi về Tiền gửi / Tiết kiệm / Chứng chỉ tiền gửi CCTG / Huy động vốn
    const isDepositQuery = /(tiết kiệm|tiền gửi|chứng chỉ tiền gửi|cctg|sinh lời|max savings|flexi savings|huy động|lãi suất gửi|sổ tiết kiệm|gửi tiền|tất toán)/i.test(lowerQ);
    if (isDepositQuery) {
      const depositEntities = db.prepare(
        "SELECT id, name, type FROM entities WHERE type IN ('SAVING', 'DEPOSIT', 'CERTIFICATE_OF_DEPOSIT') OR id LIKE '%cctg%' OR id LIKE '%saving%' OR id LIKE '%tiengui%'",
      ).all() as any[];

      if (depositEntities.length > 0) {
        const sections: string[] = [
          `📊 [Dữ liệu từ Knowledge Graph nội bộ - Tốc độ cao <10ms]`,
          `💰 CÁC SẢN PHẨM TIỀN GỬI & HUY ĐỘNG VỐN OCB:`,
        ];
        for (const ent of depositEntities) {
          const attrs = db.prepare("SELECT key, value FROM attributes WHERE entity_id = ?").all(ent.id) as any[];
          if (attrs.length > 0) {
            sections.push(`\n🔹 ${ent.name} (${ent.type}):`);
            for (const a of attrs) {
              sections.push(`• ${a.key}: ${a.value}`);
            }
          }
        }
        return sections.join("\n");
      }
    }

    // Không khớp thực thể xác định -> trả về null để luồng chính gọi NotebookLM
    return null;
  } catch (e: any) {
    log.warn({ err: e }, "Tra cứu nhanh Knowledge Graph gặp sự cố, sẽ dùng NotebookLM");
    return null;
  } finally {
    db?.close();
  }
}

// ─────────────────── KNOWLEDGE GRAPH FALLBACK KHI NOTEBOOKLM LỖI ───────────────────
function queryKnowledgeGraphFallback(query: string): string {
  const dbPath = path.join(dataDir, "banking-graph.db");
  let db: DatabaseSync | null = null;
  try {
    if (!fs.existsSync(dbPath)) {
      return "Kho chính sách nội bộ chưa được khởi tạo; cần Hoà kiểm tra nguồn trước khi tư vấn.";
    }
    db = new DatabaseSync(dbPath, { readOnly: true });
    // Trả tổng quan tất cả dự án trong SQLite
    const allProjects = db.prepare(`
      SELECT e.name, a.key, a.value
      FROM entities e
      JOIN relations r ON e.id = r.source_id AND r.relation_type = 'APPLIES_POLICY'
      JOIN attributes a ON r.target_id = a.entity_id
      WHERE e.type = 'PROJECT'
      ORDER BY e.name, a.key
    `).all() as any[];

    if (allProjects.length > 0) {
      const grouped: Record<string, Record<string, string>> = {};
      for (const row of allProjects) {
        grouped[row.name] ??= {};
        grouped[row.name]![row.key] = row.value;
      }
      const lines = [`📊 [Dữ liệu từ Knowledge Graph nội bộ - Fallback dự phòng]`];
      for (const [name, attrs] of Object.entries(grouped)) {
        lines.push(`\n🏠 ${name}: Lãi ${attrs.lai_suat_uu_dai || "?"}, ưu đãi ${attrs.thoi_gian_uu_dai || "?"}, ân hạn ${attrs.an_han_goc || "?"}, LTV ${attrs.LTV_toi_da || "?"}`);
      }
      return lines.join("\n");
    }

    return "Không tìm thấy dữ liệu trong Knowledge Graph nội bộ cho câu hỏi này.";
  } catch (e: any) {
    log.error({ err: e }, "Knowledge Graph fallback lỗi");
    return `Lỗi tra cứu Knowledge Graph: ${e.message}`;
  } finally {
    db?.close();
  }
}

// ─────────────────── MAIN TOOL ───────────────────
export function createQueryNotebookLMTool() {
  return tool({
    description:
      "Tra cứu kho kiến thức OCB (chính sách vay, dự án liên kết, thẻ tín dụng, quy chế tín dụng, sản phẩm huy động, tiền gửi tiết kiệm, chứng chỉ tiền gửi CCTG). Hệ thống tự động ưu tiên phản hồi siêu tốc từ Knowledge Graph nội bộ và mở rộng sang NotebookLM khi cần.",
    inputSchema: z.object({
      query: z.string().describe("Câu hỏi chi tiết cần tra cứu"),
    }),
    execute: async ({ query }) => {
      // ── BƯỚC 1 (LOCAL-FIRST): Thử quét nhanh SQLite Knowledge Graph (<10ms) ──
      const fastResult = queryKnowledgeGraphFast(query);
      if (fastResult) {
        log.info({ query }, "RAG Local-First HIT: Phản hồi siêu tốc từ Knowledge Graph SQLite (<10ms)");
        return fastResult;
      }

      // ── BƯỚC 2: Nếu chưa có trong SQLite -> Gọi NotebookLM qua MCP với timeout ngắn (6s) ──
      log.info({ query }, "RAG: Không có thực thể khớp tĩnh -> Chuyển tiếp truy vấn NotebookLM MCP...");
      try {
        const deadline = Date.now() + MCP_TIMEOUT_MS;
        const remaining = () => Math.max(1, deadline - Date.now());
        const client = await withTimeout(getMcpClient(), remaining(), "MCP connect");
        const result = await withTimeout(
          client.callTool({
            name: "cross_notebook_query",
            arguments: { notebook_names: NOTEBOOK_IDS, query },
          }),
          remaining(),
          "MCP cross_notebook_query",
        );

        const content = result.content as Array<any>;
        if (!content || content.length === 0) {
          return "Không tìm thấy dữ liệu trong NotebookLM.";
        }

        consecutiveFailures = 0; // reset sau khi thành công
        return content.map((c: any) => c.text).join("\n");
      } catch (err: any) {
        consecutiveFailures++;
        log.warn(
          { err: err.message, failures: consecutiveFailures },
          "NotebookLM MCP không khả dụng — chuyển sang Knowledge Graph fallback",
        );

        // Kill client hỏng để lần sau reconnect
        killMcpClient();

        // Mở circuit breaker nếu vượt ngưỡng
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
          log.warn(
            { cooldownMinutes: CIRCUIT_COOLDOWN_MS / 60_000 },
            "Circuit breaker OPEN — tạm ngưng MCP, chỉ dùng Knowledge Graph",
          );
        }

        // ── BƯỚC 3: Fallback sang Knowledge Graph SQLite tổng quan ──
        return queryKnowledgeGraphFallback(query);
      }
    },
  });
}
