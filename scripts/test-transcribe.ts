import { transcribeAudio } from "../src/agent/transcribe-audio.js";
import { getRunningAccountApi, startAllAccounts } from "../src/zalo/account-manager.js";

async function run() {
  await startAllAccounts();
  await new Promise(r => setTimeout(r, 2000));
  const api = getRunningAccountApi("acc-cham-soc-bank");
  if (!api) { console.log("No API"); return; }
  
  const url = "https://f2-voice-aac-dl.zdn.vn/768330368599227648/bdd8360275c89696cfd9.aac";
  const result = await transcribeAudio(url, api);
  console.log("TRANSCRIPT:", result);
  process.exit(0);
}
run();
