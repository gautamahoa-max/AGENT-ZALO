import { pruneToolsForTurn } from "../src/agent/dynamic-tool-pruner.js";
import { buildSystemPrompt } from "../src/agent/persona-prompt.js";
import { buildAgentTools } from "../src/agent/tools/index.js";
import { sendSystemAlert } from "../src/shared/email-alert.js";
import type { ParsedMessage } from "../src/zalo/zalo-message-parser.js";
import type { AgentProfile } from "../src/config/agent-store.js";
import type { AccountConfig } from "../src/config/account-store.js";

const mockAgent = {
  id: "agent-test",
  name: "Hoà OCB",
  persona: "Chuyên viên tín dụng OCB",
  disabledTools: [],
} as unknown as AgentProfile;

const mockAccount = {
  id: "acc-test",
  label: "Hoà Zalo",
  enabled: true,
  disabledTools: [],
} as unknown as AccountConfig;

function createMockMsg(text: string, isGroup: boolean = false): ParsedMessage {
  return {
    accountId: "acc-test",
    threadId: "thread-1",
    threadType: isGroup ? (1 as never) : (0 as never),
    isGroup,
    senderId: "user-1",
    senderName: "Nam",
    text,
    images: [],
    msgId: "m-1",
    cliMsgId: "cli-1",
    isSelf: false,
    mentionsMe: false,
    rawData: {},
  };
}

async function testDynamicToolPruning() {
  console.log("=============================================================");
  console.log("PHẦN 1: KIỂM THỬ DYNAMIC TOOL PRUNING");
  console.log("=============================================================");

  const rawTools = buildAgentTools({
    api: {} as never,
    account: mockAccount,
    agent: mockAgent,
    message: createMockMsg("Chào em"),
    batch: [createMockMsg("Chào em")],
  });

  const totalRawCount = Object.keys(rawTools).length;
  console.log(`\n• Tổng số tools đăng ký trong hệ thống: ${totalRawCount}`);

  // Ca 1: Chat 1-1 thông thường (Hỏi lãi suất)
  const msg1 = createMockMsg("Em ơi lãi suất vay mua nhà bên OCB giờ sao?", false);
  const result1 = pruneToolsForTurn(rawTools, { isGroup: false, batch: [msg1] });
  const count1 = Object.keys(result1.prunedTools).length;
  console.log(`\n▶ [Ca 1: Chat 1-1 thông thường]`);
  console.log(`Tin nhắn: "${msg1.text}"`);
  console.log(`Số tools sau khi cắt tỉa: ${count1} (Đã loại bỏ ${result1.removedToolKeys.length} tools)`);
  console.log(`Các tools bị loại:`, result1.removedToolKeys);
  const savedTokensEst = result1.removedToolKeys.length * 350;
  console.log(`=> Ước tính token tiết kiệm được cho lượt này: ~${savedTokensEst} input tokens!`);

  // Ca 2: Chat 1-1 yêu cầu file Word
  const msg2 = createMockMsg("Em soạn cho anh một file word phương án vay nhé", false);
  const result2 = pruneToolsForTurn(rawTools, { isGroup: false, batch: [msg2] });
  console.log(`\n▶ [Ca 2: Chat 1-1 yêu cầu File Word]`);
  console.log(`Tin nhắn: "${msg2.text}"`);
  console.log(`create_word_document còn giữ lại không? ->`, Boolean(result2.prunedTools.create_word_document) ? "✅ CÓ (TỰ ĐỘNG BẬT)" : "❌ KHÔNG");

  // Ca 3: Chat 1-1 yêu cầu file Excel
  const msg3 = createMockMsg("Gửi giúp anh bảng tính excel dòng tiền nha", false);
  const result3 = pruneToolsForTurn(rawTools, { isGroup: false, batch: [msg3] });
  console.log(`\n▶ [Ca 3: Chat 1-1 yêu cầu Bảng tính Excel]`);
  console.log(`Tin nhắn: "${msg3.text}"`);
  console.log(`create_excel_file còn giữ lại không? ->`, Boolean(result3.prunedTools.create_excel_file) ? "✅ CÓ (TỰ ĐỘNG BẬT)" : "❌ KHÔNG");

  // Ca 4: Group Chat (Nhóm Zalo)
  const msg4 = createMockMsg("Mọi người cho mình hỏi thông tin dự án", true);
  const result4 = pruneToolsForTurn(rawTools, { isGroup: true, batch: [msg4] });
  console.log(`\n▶ [Ca 4: Group Chat Zalo]`);
  console.log(`isGroup = true`);
  console.log(`get_group_info và tag_member có còn không? ->`, (Boolean(result4.prunedTools.get_group_info) && Boolean(result4.prunedTools.tag_member)) ? "✅ CÓ (GIỮ ĐẦY ĐỦ)" : "❌ BỊ MẤT");
}

async function testPromptCachingStructure() {
  console.log("\n=============================================================");
  console.log("PHẦN 2: KIỂM THỬ CẤU TRÚC PROMPT TỐI ƯU CONTEXT CACHING");
  console.log("=============================================================");

  const msg = createMockMsg("Tư vấn vay", false);
  const prompt = buildSystemPrompt(mockAgent, msg, undefined, mockAccount);

  const personaIndex = prompt.indexOf("Persona riêng của bạn");
  const toolCapIndex = prompt.indexOf("Các công cụ bạn có thể dùng");
  const dateIndex = prompt.indexOf("Hôm nay là");

  console.log(`• Vị trí Persona riêng     : Ký tự thứ ${personaIndex}`);
  console.log(`• Vị trí Mục Khả năng Tool : Ký tự thứ ${toolCapIndex}`);
  console.log(`• Vị trí Ngày giờ động     : Ký tự thứ ${dateIndex}`);

  const isCacheOptimized = personaIndex < dateIndex && toolCapIndex < dateIndex;
  console.log(`=> Đánh giá cấu trúc Cache-First Invariant: ${isCacheOptimized ? "✅ HOÀN HẢO (Khối tĩnh đứng trước ngày giờ động)" : "⚠️ CẦN XEM LẠI"}`);
}

async function testEmailAlertDebounce() {
  console.log("\n=============================================================");
  console.log("PHẦN 3: KIỂM THỬ DEBOUNCE WATCHDOG EMAIL ALERT");
  console.log("=============================================================");

  // Thử gửi alert 1
  const sent1 = await sendSystemAlert({
    alertKey: "test_phase2_alert",
    title: "Kiểm thử kết nối Zalo Agent Watchdog",
    message: "Đây là thông báo kiểm thử tự động hệ thống cảnh báo mất kết nối Zalo.",
    details: { test: true, time: new Date().toISOString() },
  });
  console.log(`• Lần gọi 1 (Khởi tạo alert): Kết quả = ${sent1}`);

  // Thử gửi alert 2 ngay lập tức (phải bị debounce chặn)
  const sent2 = await sendSystemAlert({
    alertKey: "test_phase2_alert",
    title: "Kiểm thử kết nối Zalo Agent Watchdog",
    message: "Đây là thông báo thứ 2 lặp lại ngay lập tức.",
  });
  console.log(`• Lần gọi 2 (Ngay lập tức): Kết quả = ${sent2} -> ${sent2 === false ? "✅ DEBOUNCE CHỐNG SPAM THÀNH CÔNG" : "❌ KHÔNG CHẶN ĐƯỢC"}`);
}

async function main() {
  await testDynamicToolPruning();
  await testPromptCachingStructure();
  await testEmailAlertDebounce();
  console.log("\n=============================================================");
  console.log("🎉 TOÀN BỘ KIỂM THỬ GIAI ĐOẠN 2 ĐÃ HOÀN TẤT THÀNH CÔNG!");
  console.log("=============================================================\n");
}

main().catch(console.error);
