import { updateLlmSettings, getEffectiveLlmSettings } from "../src/config/runtime-llm-settings.js";
import { getVisionSettings } from "../src/config/runtime-vision-settings.js";

async function run() {
  const vision = getVisionSettings();
  const googleKey = vision.sidecar.apiKey;

  if (!googleKey) {
    console.error("No Google Key found in sidecar!");
    return;
  }

  updateLlmSettings({
    provider: "google",
    baseUrl: "", // Xóa base URL của 9Router
    model: "gemini-3.6-flash",
    apiKey: googleKey
  });

  console.log("Rolled back to:", getEffectiveLlmSettings());
}
run();
