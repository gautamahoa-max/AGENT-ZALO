import { processBatch } from "../src/zalo/message-turn-processor.js";
import { getAccount } from "../src/config/account-store.js";
import { DatabaseSync } from "node:sqlite";
import type { ParsedMessage } from "../src/zalo/zalo-message-parser.js";
import { ThreadType, type API } from "zca-js";

interface TestCase {
  id: string;
  name: string;
  prompt: string;
  validate: (reply: string) => { pass: boolean; reason: string };
}

const testCases: TestCase[] = [
  {
    id: "TB432-01",
    name: "Ân hạn gốc cho khoản vay mua nhà đất có sổ <= 5 năm",
    prompt: "Em ơi anh tính vay mua căn nhà có sổ hồng ở Bình Thạnh, vay 2 tỷ trong 4 năm thôi. Anh muốn ân hạn nợ gốc 1 năm đầu để xoay vốn được không em?",
    validate: (reply) => {
      const lower = reply.toLowerCase();
      // Theo TB 432: vay <= 5 năm KHÔNG ân hạn gốc, trên 5 năm mới ân hạn
      const refusesOrExplains = lower.includes("không") || lower.includes("chưa áp dụng") || lower.includes("5 năm") || lower.includes("trên 5 năm") || lower.includes("quy định");
      const givesWrongPromise = lower.includes("được anh ơi") && lower.includes("ân hạn 1 năm");
      if (givesWrongPromise && !refusesOrExplains) {
        return { pass: false, reason: "Sai quy định: Đồng ý ân hạn cho khoản vay <= 5 năm (TB 432 cấm ân hạn <= 5 năm)." };
      }
      return { pass: true, reason: "Đúng chuẩn TB 432: Giải thích rõ vay <= 5 năm không ân hạn (hoặc tư vấn nâng kỳ hạn > 5 năm để được ân hạn)." };
    }
  },
  {
    id: "TB432-02",
    name: "Phạm vi địa bàn bán kính 80km (Nhà đất ở Đà Lạt vay tại Gia Định)",
    prompt: "Anh ở Đà Lạt, có căn nhà đất ở Đà Lạt luôn muốn thế chấp vay 3 tỷ. Em làm hồ sơ bên OCB Chi nhánh Gia Định (Bình Thạnh) cho anh được không?",
    validate: (reply) => {
      const lower = reply.toLowerCase();
      // Đà Lạt cách Bình Thạnh > 80km -> Vượt bán kính quy định
      const mentionsDistanceOrBranch = lower.includes("80km") || lower.includes("địa bàn") || lower.includes("đà lạt") || lower.includes("lâm đồng") || lower.includes("chi nhánh");
      const acceptsDirectly = lower.includes("được anh") && lower.includes("em làm luôn");
      if (acceptsDirectly && !mentionsDistanceOrBranch) {
        return { pass: false, reason: "Sai quy định: Đồng ý nhận TSBĐ và nơi cư trú vượt bán kính 80km (Đà Lạt)." };
      }
      return { pass: true, reason: "Đúng chuẩn TB 432: Nêu rõ quy định bán kính 80km hoặc hướng dẫn liên hệ CN OCB Đà Lạt/Lâm Đồng." };
    }
  },
  {
    id: "TB432-03",
    name: "So sánh ân hạn nợ gốc Dự án CĐT (The Privé) vs Nhà đất có sổ",
    prompt: "Sao hôm trước anh thấy em tư vấn The Privé được ân hạn nợ gốc 24 tháng, mà giờ anh mua nhà đất có sổ vay 10 năm em chỉ cho ân hạn 12 tháng?",
    validate: (reply) => {
      const lower = reply.toLowerCase();
      const explainsProjectVsNormal = lower.includes("chủ đầu tư") || lower.includes("dự án") || lower.includes("hỗ trợ") || lower.includes("liên kết") || lower.includes("quy định");
      if (explainsProjectVsNormal) {
        return { pass: true, reason: "Giải thích chính xác: Dự án liên kết có CĐT hỗ trợ lãi/ân hạn riêng, còn BĐS có sổ theo khung OCB (5-15 năm max 12 tháng)." };
      }
      return { pass: false, reason: "Chưa nêu bật được sự khác biệt giữa chính sách Dự án liên kết và BĐS đơn lẻ." };
    }
  }
];

async function runTest() {
  const account = getAccount("acc-cham-soc-bank");
  if (!account) throw new Error("Account not found");

  console.log("================================================================================");
  console.log("🧪 KIỂM THỬ KIẾN THỨC MỚI CẬP NHẬT: THÔNG BÁO 432.01/2026/TB-TGĐ");
  console.log("================================================================================\n");

  const results: any[] = [];
  const db = new DatabaseSync("data/zalo-agent.db");

  for (const tc of testCases) {
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`[TEST CASE ${tc.id}] ${tc.name}`);
    console.log(`Tin nhắn khách: "${tc.prompt}"`);

    const threadId = "test-tb432-" + tc.id + "-" + Date.now();
    const fakeApi = {
      sendMessage: async (msg: any, target: string, type: number) => ({ err: 0 }),
      sendSeen: async () => {},
      sendTyping: async () => {},
      addReaction: async () => {},
      resolveUrl: async () => "http://mock",
    } as unknown as API;

    const fakeMsg: ParsedMessage = {
      accountId: account.id,
      msgId: "msg-" + Date.now(),
      cliMsgId: "cli-" + Date.now(),
      threadId,
      threadType: ThreadType.User,
      senderId: "tester-" + tc.id,
      senderName: "Khách Thẩm Định",
      isGroup: false,
      isSelf: false,
      mentionsMe: false,
      images: [],
      text: tc.prompt,
      rawData: { msgId: "raw-" + tc.id, cliMsgId: "raw-cli-" + tc.id }
    };

    try {
      await processBatch(account, fakeApi, [fakeMsg]);

      // Đọc tin nhắn bot vừa trả lời từ DB
      const row = db.prepare("SELECT content FROM messages WHERE thread_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1").get(threadId) as any;
      const replyText = row?.content || "";

      console.log(`\nPhản hồi thực tế của Bot:`);
      console.log(`"${replyText}"\n`);

      const val = tc.validate(replyText);
      console.log(`Đánh giá: ${val.pass ? "✅ PASS" : "❌ FAIL"} - ${val.reason}`);
      results.push({ id: tc.id, name: tc.name, pass: val.pass, reason: val.reason });
    } catch (e: any) {
      console.error("Lỗi:", e.message);
      results.push({ id: tc.id, name: tc.name, pass: false, reason: e.message });
    }

    // Dọn dẹp message test
    db.prepare("DELETE FROM messages WHERE thread_id = ?").run(threadId);
    console.log(`--------------------------------------------------------------------------------\n`);
  }

  console.log("================================================================================");
  console.log("📊 KẾT QUẢ TỔNG HỢP KIỂM THỬ TB 432.01/2026:");
  const passed = results.filter(r => r.pass).length;
  console.log(`Đạt: ${passed} / ${results.length} bài test`);
  for (const r of results) {
    console.log(`${r.pass ? "✅" : "❌"} [${r.id}] ${r.name} -> ${r.reason}`);
  }
  console.log("================================================================================");
}

runTest().catch(console.error);
