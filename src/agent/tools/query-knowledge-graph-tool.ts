import { tool } from "ai";
import { z } from "zod";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../../config/env.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger("knowledge-graph");

export const queryKnowledgeGraphTool = tool({
  description:
    "Truy vấn bản sao Knowledge Graph nội bộ về dự án và chính sách OCB. Dữ liệu chỉ được dùng khi kết quả có nguồn/ngày hiệu lực còn hợp lệ; không coi là sự thật tuyệt đối. Chỉ hỗ trợ một câu SELECT, tối đa 100 dòng. Schema: entities(id, type, name), relations(source_id, target_id, relation_type), attributes(entity_id, key, value).",
  inputSchema: z.object({
    sqlQuery: z.string().describe("Câu lệnh SELECT SQL để truy xuất dữ liệu từ các bảng."),
  }),
  execute: async ({ sqlQuery }) => {
    log.info({ sqlQuery }, "Executing SQL on Knowledge Graph");
    const dbPath = path.join(dataDir, "banking-graph.db");
    if (!fs.existsSync(dbPath)) {
      return "Kho Knowledge Graph chưa được khởi tạo; cần Hoà kiểm tra nguồn chính sách.";
    }
    const normalized = sqlQuery.trim().replace(/;\s*$/, "");
    if (!/^SELECT\b/i.test(normalized) || normalized.includes(";") || normalized.length > 8_000) {
      return "Lỗi: Chỉ cho phép đúng một câu SELECT, không có câu lệnh nối tiếp.";
    }
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const stmt = db.prepare(`SELECT * FROM (${normalized}) AS policy_query LIMIT 100`);
      const results = stmt.all();
      return JSON.stringify({ warning: "Phải kiểm tra nguồn và ngày hiệu lực trước khi tư vấn", rows: results }, null, 2);
    } catch (e: any) {
      log.error({ error: e.message, sqlQuery }, "Lỗi khi chạy SQL");
      return "Lỗi SQL: " + e.message + "\nHãy kiểm tra lại Schema: entities(id, type, name), relations(source_id, target_id, relation_type), attributes(entity_id, key, value). Dùng JOIN nếu cần.";
    } finally {
      db.close();
    }
  },
});
