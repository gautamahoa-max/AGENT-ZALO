import { getRunningAccountApi, startAllAccounts } from "../src/zalo/account-manager.js";

async function test() {
  await startAllAccounts();
  await new Promise(r => setTimeout(r, 2000)); // wait for login
  const api = getRunningAccountApi("acc-cham-soc-bank");
  if (!api) {
    console.log("No API");
    process.exit(1);
  }
  try {
    const info = await (api as any).getUserInfo("3019726456932920010"); 
    console.log(JSON.stringify(info, null, 2));
  } catch (e) {
    console.error("ERROR", e);
  }
  process.exit(0);
}
test();
