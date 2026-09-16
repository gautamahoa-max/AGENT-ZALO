import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("data/zalo-agent.db");
db.prepare("UPDATE threads SET display_name = '' WHERE display_name = 'Đang lấy tên...'").run();
console.log("Fixed DB");
