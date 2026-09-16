import { db } from "../src/conversation/database.js";
const agents = db.prepare("SELECT * FROM agents").all();
console.log(agents);
