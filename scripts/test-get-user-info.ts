import { DatabaseSync } from "node:sqlite";

// Read DB to see if name was updated
const dbPath = "data/zalo-agent.db";
const db = new DatabaseSync(dbPath);
const rows = db.prepare("SELECT * FROM threads WHERE thread_id = '3019726456932920010'").all();
console.log("DB Content:");
console.log(rows);
