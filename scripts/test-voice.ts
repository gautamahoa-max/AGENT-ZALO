import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("data/zalo-agent.db");
const rows = db.prepare("SELECT content, images FROM messages WHERE content LIKE '%gửi tin nhắn thoại%' LIMIT 5").all();
console.log(rows);
