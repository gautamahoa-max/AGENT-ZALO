import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("data/zalo-agent.db");
console.log(db.prepare("SELECT * FROM runtime_settings").all());
