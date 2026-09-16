import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("data/zalo-agent.db");
const rows = db.prepare("SELECT value FROM agent_tuning").all();
console.log(JSON.stringify(rows, null, 2));
