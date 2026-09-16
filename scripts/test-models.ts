import { getEffectiveLlmSettings } from "../src/config/runtime-llm-settings.js";
async function run() {
  const settings = getEffectiveLlmSettings();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${settings.apiKey}`);
  const json = (await res.json()) as any;
  console.log(json.models?.map((m: any) => m.name));
}
run();
