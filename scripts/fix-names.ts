import { startAllAccounts, getRunningAccountApi } from "../src/zalo/account-manager.js";
import { setThreadDisplayName } from "../src/conversation/thread-store.js";
import { DatabaseSync } from "node:sqlite";

async function run() {
  await startAllAccounts();
  await new Promise(r => setTimeout(r, 2000));
  const api = getRunningAccountApi("acc-cham-soc-bank");
  if (!api) {
    console.log("No API");
    return;
  }
  
  const db = new DatabaseSync("data/zalo-agent.db");
  const threads = db.prepare("SELECT account_id, thread_id FROM threads WHERE display_name = ''").all() as any[];
  
  for (const t of threads) {
    try {
      const info: any = await (api as any).getUserInfo(t.thread_id);
      const profile = info?.changed_profiles?.[t.thread_id] || info?.data;
      const name = profile?.dName ?? profile?.displayName ?? profile?.zaloName ?? profile?.name;
      if (name) {
         setThreadDisplayName(t.account_id, t.thread_id, String(name));
         console.log("Updated", t.thread_id, "to", name);
      }
    } catch (e) {
      console.log("Error", t.thread_id, e);
    }
  }
  process.exit(0);
}
run();
