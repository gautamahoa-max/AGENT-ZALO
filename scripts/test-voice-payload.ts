import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("data/zalo-agent.db");
const rows = db.prepare("SELECT content FROM messages WHERE content LIKE '%thoại%' OR content LIKE '%chưa nghe được%' ORDER BY created_at DESC LIMIT 5").all();
console.log(JSON.stringify(rows, null, 2));
