import { getEffectiveLlmSettings } from "../config/runtime-llm-settings.js";
import { getVisionSettings } from "../config/runtime-vision-settings.js";
import { type API } from "zca-js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("transcribe-audio");

export async function transcribeAudio(audioUrl: string, api: API): Promise<string | null> {
  try {
    const ctx = api.getContext();
    const cookie = (ctx as any).cookie || "";

    const res = await fetch(audioUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Cookie": typeof cookie === "string" ? cookie : ""
      }
    });

    if (!res.ok) {
      log.error({ status: res.status, audioUrl }, "Không tải được file âm thanh từ Zalo");
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    
    let mimeType = res.headers.get("content-type") || "audio/mp4";
    if (mimeType.includes("amr")) mimeType = "audio/amr";
    if (!mimeType.startsWith("audio/")) mimeType = "audio/mp4";

    const settings = getEffectiveLlmSettings();
    const visionSettings = getVisionSettings();
    
    // NẾU main provider không phải google (ví dụ: openai-compatible của 9Router)
    // thì API Key chính sẽ KHÔNG gọi được API của Google. Ta phải dùng ké Key của Vision Sidecar.
    let googleApiKey = settings.apiKey;
    if (settings.provider !== "google") {
      googleApiKey = visionSettings.sidecar.apiKey;
      log.info("Main provider không phải Google, đang dùng ké Vision Sidecar API Key để dịch Voice");
    }

    if (!googleApiKey) {
      log.error("Không tìm thấy Google API Key (ở cả main và sidecar) để dịch Voice");
      return null;
    }
    
    // We can fallback to gemini-3.6-flash if model name is empty
    let modelName = settings.model || "gemini-3.6-flash";
    if (settings.provider !== "google") {
        modelName = visionSettings.sidecar.model || "gemini-3.6-flash";
    }

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${googleApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: "Bạn là hệ thống chuyển đổi giọng nói thành văn bản (Speech-to-Text). Hãy nghe kỹ đoạn ghi âm này và chép lại chính xác từng từ bằng tiếng Việt. KHÔNG được tóm tắt, KHÔNG được bình luận thêm, CHỈ chép lại nội dung người nói." },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
          }
        ]
      })
    });

    if (!geminiRes.ok) {
      log.error({ status: geminiRes.status, body: await geminiRes.text() }, "Lỗi khi gọi Gemini API");
      return null;
    }

    const json = await geminiRes.json() as any;
    return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (err) {
    log.error({ err, audioUrl }, "Lỗi khi giải mã tin nhắn thoại (Whisper/Gemini Audio)");
    return null;
  }
}
