/**
 * Bộ nhớ tạm lưu các tin nhắn do chính Bot gửi đi (để phân biệt với tin do
 * chủ tài khoản tự gõ trên điện thoại/máy tính khi bật selfListen).
 */

const botSentMsgIds = new Set<string>();
const botSentCliMsgIds = new Set<string>();
const botSentTexts = new Set<string>();

export function recordBotSentMessage(res: unknown, text?: string, threadId?: string): void {
  const r = res as { data?: { msgId?: string | number; cliMsgId?: string | number }; msgId?: string | number } | null;
  if (r?.data?.msgId || r?.msgId) {
    const id = String(r.data?.msgId ?? r.msgId);
    botSentMsgIds.add(id);
    setTimeout(() => botSentMsgIds.delete(id), 60_000);
  }
  if (r?.data?.cliMsgId) {
    const cliId = String(r.data.cliMsgId);
    botSentCliMsgIds.add(cliId);
    setTimeout(() => botSentCliMsgIds.delete(cliId), 60_000);
  }
  if (text) {
    const key = `${threadId ?? ""}:${text.trim()}`;
    botSentTexts.add(key);
    setTimeout(() => botSentTexts.delete(key), 60_000);
  }
}

export function isSentByBot(msg: {
  msgId?: string;
  cliMsgId?: string;
  text?: string;
  threadId?: string;
}): boolean {
  if (msg.msgId && botSentMsgIds.has(String(msg.msgId))) return true;
  if (msg.cliMsgId && botSentCliMsgIds.has(String(msg.cliMsgId))) return true;
  if (msg.text) {
    const key = `${msg.threadId ?? ""}:${msg.text.trim()}`;
    if (botSentTexts.has(key)) return true;
  }
  return false;
}
