import { ThreadType } from "zca-js";
import { pickImageVariant, type ImageQuality } from "./zalo-image-variant.js";

export type IncomingImage = {
  url: string;
  /** Đường dẫn file đã lưu trong data/media (tương đối với DATA_DIR) - có sau khi persist */
  localPath?: string;
};

export type ParsedMessage = {
  accountId: string;
  threadId: string;
  threadType: ThreadType;
  isGroup: boolean;
  senderId: string;
  senderName: string;
  text: string;
  images: IncomingImage[];
  audioUrl?: string;
  msgId: string;
  cliMsgId: string;
  isSelf: boolean;
  mentionsMe: boolean;
  /** data gốc của zca-js - dùng cho quote khi trả lời */
  rawData: Record<string, unknown>;
};

/**
 * Nội dung ghi vào history cho 1 tin đến. Ảnh không vào được cột text nên để
 * lại dấu vết đếm được; tin chỉ có ảnh vẫn phải có chữ, nếu không lượt sau
 * model đọc history thấy một dòng trống không hiểu chuyện gì đã xảy ra.
 */
export function describeForHistory(msg: ParsedMessage): string {
  const imageNote = msg.images.length > 0 ? ` [gửi kèm ${msg.images.length} ảnh]` : "";
  return `${msg.text}${imageNote}`.trim() || "[ảnh]";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @param imageQuality cỡ ảnh lấy từ payload Zalo - caller truyền
 * env.ZALO_IMAGE_QUALITY vào để module này thuần, test khỏi cần setupTestEnv
 * (cùng lý do với `botEnabledForThread` của allowlist-filter).
 */
export function parseIncomingMessage(
  accountId: string,
  selfId: string,
  message: any,
  imageQuality: ImageQuality = "normal",
): ParsedMessage {
  const data = message?.data ?? {};
  const content = data.content;
  const msgType = String(data.msgType ?? "");

  let text = "";
  const images: IncomingImage[] = [];

  let audioUrl: string | undefined;

  if (typeof content === "string") {
    text = content;
  } else if (content && typeof content === "object") {
    text = String(content.title ?? content.description ?? "");
    const picked = msgType.includes("photo")
      ? pickImageVariant(content as Record<string, unknown>, imageQuality)
      : null;
    if (picked) {
      images.push({ url: picked.url });
    }
    if (msgType.toLowerCase().includes("voice")) {
      console.log("=== RAW VOICE MESSAGE DATA ===");
      console.log(JSON.stringify(data, null, 2));
      console.log("==============================");
      
      if (typeof content.href === "string") {
        audioUrl = content.href;
      }
    }
  }

  if (!text.trim() && images.length === 0 && msgType) {
    const typeLower = msgType.toLowerCase();
    const senderNoun = message?.isSelf ? "Bạn" : "Khách";
    if (typeLower.includes("sticker")) {
      text = `[${senderNoun} gửi một icon/sticker]`;
    } else if (typeLower.includes("voice")) {
      text = `[${senderNoun} gửi tin nhắn thoại]`;
    } else if (typeLower.includes("undo")) {
      text = `[${senderNoun} đã thu hồi tin nhắn]`;
    }
  }

  const mentions = Array.isArray(data.mentions) ? data.mentions : [];
  const mentionsMe = mentions.some((m: any) => String(m?.uid) === selfId);

  return {
    accountId,
    threadId: String(message?.threadId ?? ""),
    threadType: message?.type ?? ThreadType.User,
    isGroup: message?.type === ThreadType.Group,
    senderId: String(data.uidFrom ?? ""),
    senderName: String(data.dName ?? "Người dùng"),
    text,
    images,
    audioUrl,
    msgId: String(data.msgId ?? ""),
    cliMsgId: String(data.cliMsgId ?? ""),
    isSelf: Boolean(message?.isSelf),
    mentionsMe,
    rawData: data,
  };
}
