import { updateLlmSettings, getEffectiveLlmSettings } from "../src/config/runtime-llm-settings.js";

updateLlmSettings({
  provider: "openai-compatible",
  baseUrl: "https://api.9router.com/v1",
  model: "meta-llama/llama-3.1-70b-instruct",
  apiKey: "sk-6740b697df577b4f-zh58cu-9dab75b2"
});

console.log("Updated settings:", getEffectiveLlmSettings());
