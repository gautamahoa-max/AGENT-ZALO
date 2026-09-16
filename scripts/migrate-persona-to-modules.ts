/**
 * Migration: Cập nhật DB persona thành bản core ngắn gọn.
 *
 * Dynamic KB Router sẽ tự động inject các KB modules liên quan
 * dựa trên nội dung tin nhắn — không cần lưu toàn bộ trong DB nữa.
 *
 * Chạy: npx tsx scripts/migrate-persona-to-modules.ts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "../data/zalo-agent.db");
const CORE_PERSONA_PATH = resolve(__dirname, "../data/personas/core-persona.md");

// Read core persona
const corePersona = readFileSync(CORE_PERSONA_PATH, "utf-8").trim();
console.log(`✅ Đọc core-persona.md: ${corePersona.length} ký tự`);

// Read current DB persona for backup
const db = new DatabaseSync(DB_PATH);
const currentRow = db.prepare(
  "SELECT persona FROM agents WHERE is_default = 1",
).get() as { persona: string } | undefined;

if (!currentRow) {
  console.error("❌ Không tìm thấy agent mặc định (is_default = 1)");
  process.exit(1);
}

const currentLen = currentRow.persona.length;
console.log(`📋 Persona hiện tại trong DB: ${currentLen} ký tự`);

// Backup current persona
const backupPath = resolve(__dirname, "../data/personas/backup-full-persona.md");
const { writeFileSync } = await import("node:fs");
writeFileSync(backupPath, currentRow.persona, "utf-8");
console.log(`💾 Đã backup persona gốc → ${backupPath}`);

// Update DB
db.prepare("UPDATE agents SET persona = ? WHERE is_default = 1").run(
  corePersona,
);

// Verify
const verifyRow = db.prepare(
  "SELECT persona FROM agents WHERE is_default = 1",
).get() as { persona: string };
const newLen = verifyRow.persona.length;

console.log(`\n📊 KẾT QUẢ MIGRATION:`);
console.log(`   Trước: ${currentLen} ký tự (~${Math.round(currentLen / 4)} tokens)`);
console.log(`   Sau:   ${newLen} ký tự (~${Math.round(newLen / 4)} tokens)`);
console.log(`   Giảm:  ${currentLen - newLen} ký tự (${Math.round(((currentLen - newLen) / currentLen) * 100)}%)`);
console.log(`\n✅ Migration thành công! Dynamic KB Router sẽ tự inject KB phù hợp mỗi lượt.`);

db.close();
