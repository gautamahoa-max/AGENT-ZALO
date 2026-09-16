import { db } from "../src/conversation/database.js";
import fs from "fs";
const agent = db.prepare("SELECT persona FROM agents WHERE is_default = 1").get() as { persona?: string } | undefined;
if (agent?.persona) {
  fs.writeFileSync("current-persona.md", agent.persona);
}
