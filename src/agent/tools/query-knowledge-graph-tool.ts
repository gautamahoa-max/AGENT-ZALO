import { tool } from "ai";
import { z } from "zod";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { dataDir } from "../../config/env.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger("knowledge-graph");

export const queryKnowledgeGraphTool = tool({
  description:
    "Dùng để truy vấn thông tin dự án BĐS (Bcons, Palm City, The Privé, Gladia), lãi suất ưu đãi, LTV, ân hạn gốc, phí phạt trả trước, hoa hồng môi giới bằng SQL từ Knowledge Graph (Sự thật tuyệt đối OCB 2026). Schema: entities(id, type, name), relations(source_id, target_id, relation_type), attributes(entity_id, key, value). Entity types: 'PROJECT', 'POLICY', 'DEVELOPER'. Relation type: 'APPLIES_POLICY', 'DEVELOPED_BY'. Attribute keys: 'lai_suat_uu_dai', 'thoi_gian_uu_dai', 'an_han_goc', 'LTV_toi_da', 'thoi_han_vay_max', 'lai_suat_tha_noi', 'phi_tra_truoc_han', 'hoa_hong_moi_gioi', 'von_tu_co_min', 'dac_quyen_qua_tang', 'chu_dau_tu', 'luu_y_dac_biet'.",
  inputSchema: z.object({
    sqlQuery: z.string().describe("Câu lệnh SELECT SQL để truy xuất dữ liệu từ các bảng."),
  }),
  execute: async ({ sqlQuery }) => {
    log.info({ sqlQuery }, "Executing SQL on Knowledge Graph");
    const dbPath = path.join(dataDir, "banking-graph.db");
    const db = new DatabaseSync(dbPath);
    try {
      if (!sqlQuery.trim().toUpperCase().startsWith("SELECT")) {
        return "Lỗi: Chỉ được phép thực thi câu lệnh SELECT.";
      }
      const stmt = db.prepare(sqlQuery);
      const results = stmt.all();
      return JSON.stringify(results, null, 2);
    } catch (e: any) {
      log.error({ error: e.message, sqlQuery }, "Lỗi khi chạy SQL");
      return "Lỗi SQL: " + e.message + "\nHãy kiểm tra lại Schema: entities(id, type, name), relations(source_id, target_id, relation_type), attributes(entity_id, key, value). Dùng JOIN nếu cần.";
    } finally {
      db.close();
    }
  },
});
