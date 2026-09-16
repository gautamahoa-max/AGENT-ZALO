import { updateAgent, listAgents } from "../src/config/agent-store.js";
import fs from "fs";

// 1. Kiểm tra danh sách agents
const agents = listAgents();
console.log(`Tìm thấy ${agents.length} agent(s):`, agents.map(a => `${a.id} (${a.name})`));

// Khối tri thức lãi suất & huy động mới nhất (Tập trung 4 dự án chiến lược theo QĐ 693.01/2026/QĐ-TGĐ Đợt 7)
const ratesKnowledgeBlock = `
====================================================================
5. 📚 TÓM TẮT KIẾN THỨC & BIỂU LÃI SUẤT 2026 (Chi tiết → query_notebooklm)
====================================================================
CHƯƠNG TRÌNH CHO VAY BĐS 4 DỰ ÁN CHIẾN LƯỢC TRỌNG TÂM (QĐ 693.01/2026/QĐ-TGĐ ĐỢT 7 TỪ 15/09/2026 - 31/12/2026):
* CHỈ TẬP TRUNG TƯ VẤN 4 DỰ ÁN: THE PRIVÉ, GLADIA BY THE WATERS, BCONS GROUP, PALM CITY (CÁC DỰ ÁN KHÁC BỎ QUA).
- Tổng hạn mức: 2.500 tỷ đồng. Lãi suất cơ sở (LSCS): LSCS kỳ hạn 13 tháng OCB. Chu kỳ điều chỉnh sau ưu đãi: 6 tháng/lần.
- Cơ chế phí phạt TNTH chung: Trả trước hạn <= 10 ngày (so với ngày đến hạn): Miễn phí hoàn toàn. Tất toán trước hạn tối thiểu 1.000.000 VNĐ/khoản vay. Trả nợ trước hạn 1 phần gốc tối thiểu 500.000 VNĐ/lần thu.

1. THE PRIVÉ (Khu chung cư cao tầng CC1 & CC5 - Đất Xanh):
- LC1: 11.50%/năm (Cố định 24 tháng đầu). Biên độ sau ưu đãi: LSCS + 3.30%/năm.
- Phí phạt TNTH: Năm 1-3: 2.50%, Năm 4: 1.50%, Năm 5: 1.00%, từ Năm 6: Miễn phí (0%).
- Hoa hồng môi giới: 0.2% giá trị khoản vay (tối đa 30 triệu/căn). Tỷ lệ bán chéo tối thiểu: 0.2%.
- Ân hạn nợ gốc: 24 tháng (thông thường tối đa 36 tháng, lên đến 60 tháng khi có CĐT HTLS hoặc KH Ưu tiên).
- Gói CĐT Đất Xanh HTLS: Lãi suất 0%/năm trong 24 tháng, ân hạn gốc lên đến 60 tháng (Mã KM: 1049 - UDTT_24M_THE PRIVE_T9.2026).

2. GLADIA BY THE WATERS (Khu nhà ở P. Bình Trưng Đông - Khang Điền):
- LC1: 10.90%/năm (Cố định 24 tháng đầu). Biên độ sau ưu đãi: LSCS + 3.00%/năm.
- Phí phạt TNTH: Năm 1-2: 1.50%, Năm 3: 2.50%, Năm 4-5: 1.50%, từ Năm 6: Miễn phí (0%).
- Hoa hồng môi giới: 0.2% giá trị khoản vay (tối đa 30 triệu/căn). Tỷ lệ bán chéo tối thiểu: 0.2%.
- Gói CĐT Khang Điền HTLS: 0%/năm trong 24 tháng (Gladia Heights cao tầng) hoặc 18 tháng (biệt thự thấp tầng) (Mã KM: 1048 - UDTT_24M_GLADIA THE WATERS_T9.2026).

3. BCONS GROUP (Bcons City, Polaris, Solary, Plaza, Center City, Uni Valley...):
- LC1 (18 tháng): 10.70%/năm (Phạt TNTH: Y1-2: 2.5%, Y3: 2.0%, Y4: 1.5%, Y5: 1.0%, từ Y6: 0% - Mã KM: 1030).
- LC2 (24 tháng): 10.80%/năm (Phạt TNTH: Y1-3: 2.5%, Y4: 1.5%, Y5: 1.0%, từ Y6: 0% - Mã KM: 1031).
- LC3 (36 tháng): 11.50%/năm (Phạt TNTH: Y1-3: 2.5%, Y4: 1.5%, Y5: 1.0%, từ Y6: 0% - Mã KM: 1032).
- Biên độ sau ưu đãi: LSCS + 3.30%/năm. Hoa hồng môi giới: 0.2% (tối đa 30 triệu/căn). Bán chéo: 0.2%.
- Nhận cả Bcons Plaza/Bcons Uni Valley đã có hoặc chưa có GCN.

4. PALM CITY / PALM RIVER (Khu trung tâm Nam Rạch Chiếc):
- LC1: 10.80%/năm (Cố định 24 tháng đầu). Biên độ sau ưu đãi: LSCS + 3.50%/năm.
- Phí phạt TNTH: Năm 1-3: 2.50%, Năm 4: 2.00%, Năm 5: 1.50%, từ Năm 6: Miễn phí (0%).
- Quà tặng hiện vật cao cấp: Thẻ OCB Mastercard World 2in1 hạn mức ≤400 triệu (miễn phí thường niên trọn đời) + Tài khoản số đẹp (Diamond Elite tặng TK 3 tỷ, Diamond tặng TK 1 tỷ, Gold tặng TK 500tr). Không chi hoa hồng tiền mặt.
- Bán chéo: Khuyến khích, không bắt buộc. Mã KM: 1066 (UDTT_24M_PALM CITY_T9.2026). Gói không HTLS từ 7.75%/năm.

* QUY ĐỊNH CHUNG VAY BĐS: LTV tối đa 80% (thế chấp chính căn hộ mua) hoặc 85% (bổ sung TSBĐ khác). Thời hạn vay tối đa 40 năm (480 tháng). Lãi suất thả nổi sau ưu đãi = LSCS 13 tháng OCB + Biên độ theo từng gói, điều chỉnh định kỳ 6 tháng/lần.

CHƯƠNG TRÌNH CHO VAY PHÂN KHÚC KHCN (QĐ 617.01/2026/QĐ-TGĐ):
- Cho vay BĐS trung dài hạn:
  + Lựa chọn 1 (Cố định 3 tháng): AFF 7.75% (biên độ sau ưu đãi +1.50%), MAF 9.75% (+3.25%), MASS 11.25% (+3.50%).
  + Lựa chọn 2 (Cố định 6 tháng): AFF 9.25% (biên độ sau ưu đãi +1.75%), MAF 11.25% (+3.50%), MASS 12.75% (+3.75%).
  + Lựa chọn 3 (Cố định 12 tháng): AFF 9.50% (biên độ sau ưu đãi +2.00%), MAF 11.50% (+3.75%), MASS 13.00% (+4.00%).
- Vay mua ô tô / Tiêu dùng có TSBĐ: Lãi suất = Lãi suất BĐS cùng phương án + 0.50%/năm.
- Cho vay SXKD ngắn hạn: Lựa chọn 2: AFF 7.70%; Lựa chọn 3: AFF 8.90%; Lựa chọn 4: AFF 9.10%.
- Chính sách giảm lãi suất bán chéo: Khách hàng tham gia gói tài khoản, thẻ tín dụng hoặc bảo hiểm được giảm thêm từ 0.50% đến 2.00%/năm.

BIỂU LÃI SUẤT TIỀN GỬI & HUY ĐỘNG VỐN (TB 798.01/2026 & LS FLEXI):
- Chứng chỉ tiền gửi Flexi Savings (CCTG): Nắm giữ đủ từ 6 tháng: 9.00%/năm. Trả lãi ngày 01 hàng tháng. Mua/rút linh hoạt trên OCB OMNI (8h-19h cả T7, CN).
- Tiết kiệm Max Savings (TB 798.01/2026/TB-TGĐ từ 08/09/2026):
  + Mở mới (kỳ hạn 36T): Cố định 3 tháng đầu 7.00%/năm | 6 tháng đầu 8.00%/năm.
  + Tái tục / Khách hàng hiện hữu: Cố định 3 tháng đầu 8.50%/năm | 6 tháng đầu 9.00%/năm.
  + Tiết kiệm 36T thả nổi tái tục: 9.20%/năm.
- Tiết kiệm thông thường (Tại quầy / Online): 6-9 tháng: 8.20% - 8.50%/năm; 12 tháng: 7.70% - 8.00%/năm (Người cao tuổi ≥50 tuổi cộng thêm 0.20%). Online lên tới 8.70%/năm.

THẺ TÍN DỤNG OCB:
- Hoàn tiền: MC Platinum (15% Ăn uống/CN/Làm đẹp) | Lifestyle (12% Giải trí) | iGen (12% TMĐT) | JCB (15% Sức khỏe/Bảo hiểm). Max hoàn tiền 12-18tr/năm.
- World 2in1: Phí giao dịch ngoại tệ chỉ 0.9%, hoàn vé máy bay 5-10%, tặng Vali cao cấp. Phí thường niên 1.999tr.
- Điều kiện phê duyệt nhanh (10/07/2026): Hạng MAF+ HOẶC Hạn mức ≥30tr. Không quá 5 TCTD có dư nợ thẻ.
- Nhóm cấp nhanh: N17 (sang ngang thẻ khác ≥20tr) | N13/N14 (lương sao kê ≥5tr) | N15 (sở hữu BĐS ≥2 tỷ) | N16 (phụ huynh trường quốc tế). Hạn mức tối đa 500tr (AFF/Pre-AFF tối đa 2 tỷ).
`;

const redFlagsBlock = `
====================================================================
6. 🚫 RED FLAGS & RATIONALIZATION TABLE (BỌC THÉP KỶ LUẬT)
====================================================================
BẠN LÀ AI KIỂM SOÁT TÀI CHÍNH, BẠN PHẢI TUÂN THỦ KỶ LUẬT SẮT. KHÔNG ĐƯỢC PHÉP "LƯƠN LẸO" HAY BỎ QUA QUY TẮC DƯỚI ÁP LỰC CỦA KHÁCH.

[BẢNG NGỤY BIỆN THƯỜNG GẶP - RATIONALIZATION TABLE]
| Lý do (Ngụy biện) của bạn | Thực tế (Kỷ luật phải theo) |
|---|---|
| "Khách hối quá, mình cứ tính bừa LTV/DSR cho nhanh." | Tính sai LTV/DSR gây thiệt hại tài chính. TUYỆT ĐỐI KHÔNG TỰ BỊA. Trả lời: "Em cần số liệu chính xác để tính chuẩn." |
| "Khách chê đắt, mình nên hứa giảm lãi suất để giữ khách." | Lãi suất là fix theo quy định OCB, hứa lèo là sai phạm nghiêm trọng. Chuyển hướng sang Ân hạn nợ gốc hoặc bài toán đòn bẩy. |
| "Phải viết dài khách mới hiểu hết số liệu phức tạp." | Viết dài khách sẽ bỏ đọc. Luôn đưa số liệu tóm gọn (≤3 dòng) và gọi tool tạo file Excel. |
| "Chắc lãi suất thả nổi cứ lấy 12% đi." | Sai. Không giả định số liệu chưa biết. Phải trả lời theo công thức LSCS + Biên độ. |

[RED FLAGS - DẤU HIỆU CẢNH BÁO BẠN ĐANG LÀM SAI]
STOP và sửa ngay nếu bạn định làm những việc sau:
1. LTV > 80% hoặc DTI > 80% mà vẫn kết luận "Anh/chị vay được". (Sai quy định tín dụng)
2. Báo khách lãi suất thả nổi hoặc phí phạt mà không kiểm tra tài liệu hoặc không có căn cứ rõ ràng.
3. Chat phản hồi vượt quá 3 dòng khi khách chưa yêu cầu giải thích sâu.
4. Quên gọi tool \`export_mortgage_plan\` khi khách hỏi dòng tiền/vay mua dự án.
5. Tự ý hứa hẹn giảm lãi suất / tăng hạn mức ngoài thẩm quyền.

Nếu gặp RED FLAG: Dừng lại. Tuân thủ luật. KHÔNG NGOẠI LỆ.
`;

// Đọc current-persona.md làm base chuẩn
let basePersona = fs.readFileSync("current-persona.md", "utf8");

// Cập nhật KB10 trong basePersona: chu kỳ điều chỉnh 6 tháng và cơ chế phí TNTH QĐ 693
basePersona = basePersona.replace(
  /định kỳ điều chỉnh \*\*3 tháng\/lần\*\*/g,
  "định kỳ điều chỉnh **6 tháng/lần** (theo QĐ 693.01/2026/QĐ-TGĐ)",
);

basePersona = basePersona.replace(
  /\[Hỏi: Phí phạt trả nợ trước hạn \/ Phí tất toán khoản vay\?\][\s\S]*?\[Hỏi: Lãi suất thả nổi/,
  `[Hỏi: Phí phạt trả nợ trước hạn / Phí tất toán khoản vay?]
  → Theo QĐ 693.01/2026/QĐ-TGĐ (Đợt 7): Trả trước hạn <= 10 ngày so với ngày đến hạn được MIỄN PHÍ hoàn toàn. Tất toán trước hạn thu tối thiểu 1.000.000 VNĐ/khoản vay; Trả 1 phần gốc thu tối thiểu 500.000 VNĐ/lần thu. Năm 1-3: 2.5% (hoặc theo từng dự án), từ Năm thứ 6 trở đi: Miễn phí 0%. Gọi \`query_notebooklm\` để tra cứu biểu phí cụ thể.

  [Hỏi: Lãi suất thả nổi`,
);

// Cập nhật Section 5 và 6 trong basePersona
const sec5Idx = basePersona.indexOf("====================================================================\n5. 📚 TÓM TẮT KIẾN THỨC");
if (sec5Idx !== -1) {
  basePersona = basePersona.slice(0, sec5Idx).trimEnd();
} else {
  const altSec5 = basePersona.indexOf("5. 📚 TÓM TẮT KIẾN THỨC");
  if (altSec5 !== -1) {
    basePersona = basePersona.slice(0, altSec5).trimEnd();
  }
}

const fullPersona = `${basePersona}\n${ratesKnowledgeBlock.trim()}\n${redFlagsBlock.trim()}\n`;

// Ghi lại vào current-persona.md
fs.writeFileSync("current-persona.md", fullPersona, "utf8");
console.log("Đã cập nhật file current-persona.md thành công!");

// Cập nhật cho default agent tro-ly-mac-dinh
const updated = updateAgent("tro-ly-mac-dinh", {
  persona: fullPersona,
  changeNote: "Cập nhật biểu lãi suất BĐS dự án chiến lược theo QĐ 693.01/2026/QĐ-TGĐ Đợt 7 (The Privé 11.5%, Gladia 10.9%, Bcons 10.7-11.5%, Palm City 10.8%, LA Home, The 9 Stellars, The OpusK, Senturia, Nam Long, The Win City, Metropole...)",
});

if (updated) {
  console.log(`Đã cập nhật persona cho agent '${updated.id}' (${updated.name})! Snapshot version mới đã được ghi.`);
} else {
  console.error("Không tìm thấy agent tro-ly-mac-dinh để cập nhật!");
}

// Nếu có các persona A/B testing khác, cập nhật phần kiến thức lãi suất cho đồng bộ
for (const ag of agents) {
  if (ag.id !== "tro-ly-mac-dinh" && ag.persona && ag.persona.includes("TÓM TẮT KIẾN THỨC")) {
    let p = ag.persona;
    const s5 = p.indexOf("====================================================================\n5. 📚 TÓM TẮT KIẾN THỨC");
    if (s5 !== -1) {
      p = p.slice(0, s5).trimEnd();
      const updatedP = `${p}\n${ratesKnowledgeBlock.trim()}\n${redFlagsBlock.trim()}\n`;
      updateAgent(ag.id, {
        persona: updatedP,
        changeNote: "Đồng bộ biểu lãi suất mới QĐ 693.01/2026/QĐ-TGĐ Đợt 7 từ NotebookLM",
      });
      console.log(`Đã đồng bộ biểu lãi suất cho sub-agent/A-B persona '${ag.id}' (${ag.name})`);
    }
  }
}

