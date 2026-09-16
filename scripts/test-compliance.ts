import { runComplianceGuard } from "../src/agent/compliance-agent.js";
import { createQueryNotebookLMTool } from "../src/agent/tools/query-notebooklm-tool.js";

const testCases = [
  {
    desc: "Chào hỏi thông thường (An toàn - Kỳ vọng Heuristic Bypass)",
    text: "Dạ em chào anh Nam ạ, em là Hoà chuyên viên tín dụng OCB Gia Định, anh cần em hỗ trợ dự án nào ạ?",
  },
  {
    desc: "Lãi suất kèm câu rào chắn an toàn (Kỳ vọng Heuristic Bypass)",
    text: "Dạ em gửi anh bảng tính, lãi suất ưu đãi năm đầu là 7.2%, sau ưu đãi thả nổi theo thị trường ạ. Hồ sơ của anh em sẽ gửi phòng thẩm định xem xét nhé.",
  },
  {
    desc: "Địa chỉ chi nhánh và hẹn cà phê (An toàn - Kỳ vọng Heuristic Bypass)",
    text: "Dạ chi nhánh OCB bên em ở 123 Phan Đăng Lưu, Bình Thạnh. Khi nào anh tiện ghé qua cà phê với em nhé?",
  },
  {
    desc: "Quy tắc 1: Cam kết 100% giải ngân (Vi phạm - Kỳ vọng LLM sửa đổi)",
    text: "Dạ hồ sơ của anh rất đẹp, bên em chắc chắn 100% sẽ duyệt cho anh vay 5 tỷ ạ.",
  },
  {
    desc: "Quy tắc 2: Hứa hẹn lãi suất cố định không rào trước (Vi phạm - Kỳ vọng LLM sửa đổi)",
    text: "Lãi suất cố định 7.5% cho suất vay này nhé anh.",
  },
  {
    desc: "Quy tắc 3: Khuyên làm giả bảng lương (Vi phạm - Kỳ vọng LLM sửa đổi)",
    text: "Dạ anh cứ làm giả bảng lương công ty A đi, bên em sẽ du di cho.",
  },
];

async function run() {
  console.log("=============================================================");
  console.log("PHẦN 1: KIỂM THỬ COMPLIANCE GUARD (HEURISTIC CASCADING)");
  console.log("=============================================================");

  let bypassCount = 0;

  for (const tc of testCases) {
    console.log(`\n▶ [${tc.desc}]`);
    console.log("INPUT   :", tc.text);

    const start = performance.now();
    const result = await runComplianceGuard(tc.text);
    const duration = performance.now() - start;

    const isBypass = result.reason.includes("Heuristic Pass");
    if (isBypass) bypassCount++;

    console.log(`LATENCY : ${duration.toFixed(2)}ms ${isBypass ? "(⚡ SIÊU TỐC - 0 TOKEN)" : "(🤖 LLM AUDIT)"}`);
    console.log("APPROVED:", result.approved);
    console.log("REASON  :", result.reason);
    if (!result.approved) {
      console.log("REWRITTEN:", result.rewrittenText);
    }
  }

  console.log(`\n=> Tỷ lệ Bypass tin an toàn: ${bypassCount}/3`);

  console.log("\n=============================================================");
  console.log("PHẦN 2: KIỂM THỬ LOCAL-FIRST RAG (<10ms)");
  console.log("=============================================================");

  const tool = createQueryNotebookLMTool();
  const ragQueries = [
    {
      title: "Tra cứu Dự án Gladia Heights",
      query: "Chính sách vay dự án Gladia Heights OCB thế nào?",
    },
    {
      title: "Tra cứu Thẻ tín dụng OCB",
      query: "Thẻ tín dụng OCB iGen và World 2in1 hoàn tiền bao nhiêu?",
    },
    {
      title: "Tra cứu Quy định bán kính 80km & Ân hạn gốc TB 432",
      query: "Quy định địa bàn cấp tín dụng bán kính 80km và ân hạn gốc mới theo TB 432?",
    },
  ];

  for (const q of ragQueries) {
    console.log(`\n▶ [${q.title}]`);
    console.log("QUERY   :", q.query);

    const start = performance.now();
    // @ts-ignore
    const ragResult = await tool.execute({ query: q.query }, { toolCallId: "call_test", messages: [] });
    const duration = performance.now() - start;

    console.log(`LATENCY : ${duration.toFixed(2)}ms ${duration < 50 ? "(⚡ LOCAL-FIRST HIT)" : "(🌐 MCP NOTEBOOKLM)"}`);
    console.log("TRÍCH ĐOẠN:\n" + String(ragResult).slice(0, 220) + "\n...");
  }
}

run().catch(console.error);
