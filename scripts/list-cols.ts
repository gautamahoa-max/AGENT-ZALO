import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("data/zalo-agent.db");
console.log(db.prepare("PRAGMA table_info(messages)").all());
