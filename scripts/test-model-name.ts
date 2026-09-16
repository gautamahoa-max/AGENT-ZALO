import { getEffectiveLlmSettings } from "../src/config/runtime-llm-settings.js";

async function run() {
  const settings = getEffectiveLlmSettings();
  console.log("Model setting in DB:", settings.model);
  
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Hello" }] }]
    })
  });
  console.log("Status:", res.status);
  if (!res.ok) console.log(await res.text());
}
run();
