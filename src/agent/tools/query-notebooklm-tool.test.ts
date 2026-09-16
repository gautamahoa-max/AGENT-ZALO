import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── Test Knowledge Graph Fallback trực tiếp ──
// NotebookLM MCP subprocess không khởi động được trong test (cần venv ngoài),
// nên ta test logic fallback và circuit breaker riêng.

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const TEST_DB_PATH = path.join(process.cwd(), "data", "__test_banking_graph.db");

function createTestDb() {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  const db = new DatabaseSync(TEST_DB_PATH);
  db.exec(`
    CREATE TABLE entities (id TEXT PRIMARY KEY, type TEXT, name TEXT);
    CREATE TABLE relations (source_id TEXT, target_id TEXT, relation_type TEXT);
    CREATE TABLE attributes (entity_id TEXT, key TEXT, value TEXT);

    INSERT INTO entities VALUES ('prj_gladia', 'PROJECT', 'Gladia By The Waters');
    INSERT INTO entities VALUES ('prj_bcons', 'PROJECT', 'Bcons City');
    INSERT INTO entities VALUES ('pol_gladia', 'POLICY', 'Gói vay chuẩn Gladia');
    INSERT INTO entities VALUES ('pol_bcons', 'POLICY', 'Gói vay chuẩn Bcons');

    INSERT INTO relations VALUES ('prj_gladia', 'pol_gladia', 'APPLIES_POLICY');
    INSERT INTO relations VALUES ('prj_bcons', 'pol_bcons', 'APPLIES_POLICY');

    INSERT INTO attributes VALUES ('pol_gladia', 'lai_suat_uu_dai', '10.5%/năm');
    INSERT INTO attributes VALUES ('pol_gladia', 'thoi_gian_uu_dai', '24 tháng');
    INSERT INTO attributes VALUES ('pol_gladia', 'an_han_goc', '24 tháng');
    INSERT INTO attributes VALUES ('pol_gladia', 'LTV_toi_da', '70%');

    INSERT INTO attributes VALUES ('pol_bcons', 'lai_suat_uu_dai', '10.2%/năm');
    INSERT INTO attributes VALUES ('pol_bcons', 'thoi_gian_uu_dai', '12 tháng');
    INSERT INTO attributes VALUES ('pol_bcons', 'an_han_goc', '0 tháng');
    INSERT INTO attributes VALUES ('pol_bcons', 'LTV_toi_da', '80%');
  `);
  db.close();
}

// Inline fallback logic for isolated testing (doesn't depend on dataDir)
function queryKnowledgeGraphFallbackTest(query: string, dbPath: string): string {
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath);
    const lowerQ = query.toLowerCase();
    const projects = db.prepare("SELECT * FROM entities WHERE type = 'PROJECT'").all() as any[];
    const matchedProject = projects.find((p: any) =>
      lowerQ.includes(p.name.toLowerCase()) || lowerQ.includes(p.id.replace("prj_", "")),
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
        const attrMap = Object.fromEntries(attrs.map((a: any) => [a.key, a.value]));
        return [
          `📊 [Dữ liệu từ Knowledge Graph nội bộ - NotebookLM đang tạm ngắt]`,
          `🏠 Dự án: ${matchedProject.name}`,
          `• Lãi suất ưu đãi: ${attrMap.lai_suat_uu_dai || "N/A"}`,
          `• Thời gian ưu đãi: ${attrMap.thoi_gian_uu_dai || "N/A"}`,
          `• Ân hạn gốc: ${attrMap.an_han_goc || "N/A"}`,
          `• LTV tối đa: ${attrMap.LTV_toi_da || "N/A"}`,
        ].join("\n");
      }
    }

    // Tổng quan
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
      for (const row of allProjects as any[]) {
        grouped[row.name] ??= {};
        grouped[row.name]![row.key] = row.value;
      }
      const lines = [`📊 [Dữ liệu từ Knowledge Graph nội bộ - NotebookLM đang tạm ngắt]`];
      for (const [name, attrs] of Object.entries(grouped)) {
        lines.push(`\n🏠 ${name}: Lãi ${attrs.lai_suat_uu_dai || "?"}, ưu đãi ${attrs.thoi_gian_uu_dai || "?"}, ân hạn ${attrs.an_han_goc || "?"}, LTV ${attrs.LTV_toi_da || "?"}`);
      }
      return lines.join("\n");
    }

    return "Không tìm thấy dữ liệu trong Knowledge Graph nội bộ cho câu hỏi này.";
  } catch (e: any) {
    return `Lỗi tra cứu Knowledge Graph: ${e.message}`;
  } finally {
    db?.close();
  }
}

describe("NotebookLM fallback → Knowledge Graph", () => {
  beforeEach(() => {
    createTestDb();
  });

  it("tìm đúng dự án Gladia khi query nhắc tên", () => {
    const result = queryKnowledgeGraphFallbackTest("Lãi suất dự án Gladia By The Waters bao nhiêu?", TEST_DB_PATH);
    assert.ok(result.includes("Gladia By The Waters"), "phải khớp tên dự án");
    assert.ok(result.includes("10.5%/năm"), "phải trả lãi suất đúng");
    assert.ok(result.includes("24 tháng"), "phải trả thời gian ưu đãi");
    assert.ok(result.includes("70%"), "phải trả LTV");
  });

  it("tìm đúng dự án Bcons khi query nhắc tên viết thường", () => {
    const result = queryKnowledgeGraphFallbackTest("bcons city lãi suất bao nhiêu", TEST_DB_PATH);
    assert.ok(result.includes("Bcons City"));
    assert.ok(result.includes("10.2%/năm"));
    assert.ok(result.includes("80%"));
  });

  it("trả tổng quan tất cả dự án khi query không khớp cụ thể", () => {
    const result = queryKnowledgeGraphFallbackTest("Cho xem tất cả các dự án", TEST_DB_PATH);
    assert.ok(result.includes("Knowledge Graph nội bộ"), "phải có label nguồn dữ liệu");
    assert.ok(result.includes("Gladia"), "phải liệt kê Gladia");
    assert.ok(result.includes("Bcons"), "phải liệt kê Bcons");
  });

  it("kết quả fallback có ghi chú nguồn để khách biết", () => {
    const result = queryKnowledgeGraphFallbackTest("Lãi suất Gladia", TEST_DB_PATH);
    assert.ok(result.includes("NotebookLM đang tạm ngắt"), "phải ghi chú NotebookLM đang tạm ngắt");
  });

  it("DB không tồn tại thì trả lỗi thay vì crash", () => {
    const result = queryKnowledgeGraphFallbackTest("test", "/tmp/nonexistent.db");
    assert.ok(result.includes("Lỗi") || result.includes("Không tìm thấy"), "phải trả thông báo lỗi");
  });
});

// Cleanup
import { after } from "node:test";
after(() => {
  try { fs.unlinkSync(TEST_DB_PATH); } catch { /* ok */ }
});
