import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "../src/config/env.js";

const dbPath = path.join(dataDir, "banking-graph.db");

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL
  );

  CREATE TABLE relations (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    FOREIGN KEY(source_id) REFERENCES entities(id),
    FOREIGN KEY(target_id) REFERENCES entities(id)
  );

  CREATE TABLE attributes (
    entity_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    FOREIGN KEY(entity_id) REFERENCES entities(id)
  );
`);

const insertEntity = db.prepare("INSERT INTO entities (id, type, name) VALUES (?, ?, ?)");
const insertRelation = db.prepare("INSERT INTO relations (source_id, target_id, relation_type) VALUES (?, ?, ?)");
const insertAttribute = db.prepare("INSERT INTO attributes (entity_id, key, value) VALUES (?, ?, ?)");

db.exec("BEGIN TRANSACTION");
try {
  // 1. Entities: 4 DỰ ÁN CHIẾN LƯỢC TRỌNG TÂM (QĐ 693.01/2026/QĐ-TGĐ ĐỢT 7)
  insertEntity.run("prj_the_prive", "PROJECT", "The Privé (Khu chung cư cao tầng CC1 và CC5)");
  insertEntity.run("prj_gladia", "PROJECT", "Gladia By The Waters / Gladia Heights (Bình Trưng Đông)");
  insertEntity.run("prj_bcons", "PROJECT", "Bcons Group (Bcons City, Bcons Avenue, Bcons Solary, Bcons Plaza, Bcons Center City, Bcons Uni Valley)");
  insertEntity.run("prj_palm_river", "PROJECT", "Palm River / Palm City (Nam Rạch Chiếc, Palm Heights, Palm Residence)");

  // 2. Entities: CHỦ ĐẦU TƯ CỦA 4 DỰ ÁN
  insertEntity.run("cdt_dat_xanh", "DEVELOPER", "Công ty Cổ phần Tập đoàn Đất Xanh (ĐXG)");
  insertEntity.run("cdt_gladia", "DEVELOPER", "Công ty TNHH Bất động sản Bình Trưng Mới & Nhà Đoàn Nguyên (Khang Điền)");
  insertEntity.run("cdt_bcons", "DEVELOPER", "Bcons Group");
  insertEntity.run("cdt_nam_rach_chiec", "DEVELOPER", "Công ty TNHH Nam Rạch Chiếc");

  // 3. Entities: QUY ĐỊNH VĂN BẢN
  insertEntity.run("reg_ocb_lending_qd693", "REGULATION", "Quyết định số 693.01/2026/QĐ-TGĐ ngày 11/09/2026 - Chương trình lãi suất cho KHCN vay vốn mua BĐS tại các dự án chiến lược năm 2026 (Đợt 7)");
  insertEntity.run("reg_ocb_lending_qd617", "REGULATION", "Quyết định 617.01/2026/QĐ-TGĐ - Chương trình lãi suất cho vay theo phân khúc KHCN OCB");
  insertEntity.run("reg_ocb_lending_core", "REGULATION", "Quy định vay vốn OCB - Tiêu chuẩn tín dụng & Hồ sơ pháp lý");
  insertEntity.run("reg_ocb_credit_cards", "REGULATION", "Thẻ tín dụng OCB - Danh mục sản phẩm, điều kiện mở thẻ & ưu đãi hoàn tiền");

  // 4. Entities: TIỀN GỬI & HUY ĐỘNG VỐN
  insertEntity.run("sav_max_savings", "SAVING", "Tiền gửi sinh lời tối ưu Max Savings (Thông báo 798.01/2026/TB-TGĐ từ 08/09/2026)");
  insertEntity.run("cctg_flexi_savings", "CERTIFICATE_OF_DEPOSIT", "Chứng chỉ tiền gửi Flexi Savings (QĐ 815.01/2025/QĐ-TGĐ)");
  insertEntity.run("sav_floating_36m", "SAVING", "Tiết kiệm 36 tháng lãi suất thả nổi OCB (Thông báo 798.01/2026)");
  insertEntity.run("sav_regular_deposit", "DEPOSIT", "Tiết kiệm thông thường tại quầy và online OCB OMNI (Thông báo 716.01/2026)");

  // 5. Attributes cho QĐ 693 (Tập trung 4 dự án)
  insertAttribute.run("reg_ocb_lending_qd693", "so_quyet_dinh", "693.01/2026/QĐ-TGĐ ngày 11/09/2026");
  insertAttribute.run("reg_ocb_lending_qd693", "ten_chuong_trinh", "Chương trình lãi suất cho KHCN vay vốn mua BĐS tại 4 dự án chiến lược trọng tâm (The Privé, Gladia, Bcons, Palm City) năm 2026 (Đợt 7)");
  insertAttribute.run("reg_ocb_lending_qd693", "hieu_luc", "Kể từ ngày 15/09/2026 đến hết 31/12/2026 hoặc đến khi hết hạn mức 2.500 tỷ đồng");
  insertAttribute.run("reg_ocb_lending_qd693", "han_muc", "2.500 tỷ đồng");
  insertAttribute.run("reg_ocb_lending_qd693", "lai_suat_co_so", "LSCS kỳ hạn 13 tháng OCB ban hành từng thời kỳ");
  insertAttribute.run("reg_ocb_lending_qd693", "chu_ky_dieu_chinh", "6 tháng/lần sau thời gian ưu đãi");
  insertAttribute.run("reg_ocb_lending_qd693", "co_che_thu_phi_tnth_chung", "Trả trước hạn <= 10 ngày so với ngày đến hạn: Miễn phí. Tất toán trước hạn: Tối thiểu 1.000.000 VNĐ/khoản vay. Trả nợ trước hạn 1 phần gốc: Tối thiểu 500.000 VNĐ/khoản vay/lần thu. Trả trước hạn theo mục d khoản 4 Điều 4 QĐ 249/2017: Không thu phí.");

  // Helper add policy
  function addPolicy(prjId: string, polId: string, polName: string, attrs: Record<string, string>, devId?: string) {
    insertEntity.run(polId, "POLICY", polName);
    insertRelation.run(prjId, polId, "APPLIES_POLICY");
    if (devId) {
      insertRelation.run(prjId, devId, "DEVELOPED_BY");
    }
    for (const [k, v] of Object.entries(attrs)) {
      insertAttribute.run(polId, k, v);
    }
  }

  // 1. THE PRIVÉ
  addPolicy("prj_the_prive", "pol_the_prive_standard", "Chính sách vay The Privé (QĐ 693.01 Đợt 7)", {
    chu_dau_tu: "Công ty Cổ phần Tập đoàn Đất Xanh (ĐXG / Đất Xanh)",
    lai_suat_uu_dai: "11.50%/năm (Cố định 24 tháng đầu theo QĐ 693.01)",
    thoi_gian_uu_dai: "24 tháng đầu",
    an_han_goc: "Tối đa 36 tháng (thông thường) - lên đến 60 tháng (khi có CĐT HTLS hoặc KH Ưu tiên)",
    LTV_toi_da: "80% (nguồn thu Ưu tiên), 75% (thu nhập chuẩn/AUM/TSTL), 70% (bảng kê thu nhập thực tế)",
    thoi_han_vay_max: "40 năm (480 tháng)",
    lai_suat_tha_noi: "LSCS kỳ hạn 13 tháng OCB + Biên độ 3.30%/năm (điều chỉnh 6 tháng/lần)",
    phi_tra_truoc_han: "Năm 1-3: 2.50%, Năm 4: 1.50%, Năm 5: 1.00%, từ Năm 6: Miễn phí (0%). Tất toán tối thiểu 1tr, trả 1 phần tối thiểu 500k, <= 10 ngày miễn phí.",
    hoa_hong_moi_gioi: "0.2% giá trị khoản vay, tối đa 30 triệu đồng/khoản vay",
    ty_le_ban_cheo: "Tối thiểu 0.2%",
    ma_khuyen_mai: "1049 (UDTT_24M_THE PRIVE_T9.2026)",
    goi_htls: "Gói CĐT Đất Xanh tài trợ 100% lãi vay (lãi 0%) trong 24 tháng, ân hạn gốc lên đến 60 tháng",
  }, "cdt_dat_xanh");

  // 2. GLADIA BY THE WATERS
  addPolicy("prj_gladia", "pol_gladia_standard", "Chính sách vay Gladia By The Waters (QĐ 693.01 Đợt 7)", {
    chu_dau_tu: "Công ty TNHH BĐS Bình Trưng Mới & Nhà Đoàn Nguyên (Khang Điền)",
    lai_suat_uu_dai: "10.90%/năm (Cố định 24 tháng đầu theo QĐ 693.01)",
    thoi_gian_uu_dai: "24 tháng đầu",
    an_han_goc: "24 tháng (cao tầng Gladia Heights) / 18 tháng (thấp tầng) / Tối đa 36-60 tháng",
    LTV_toi_da: "80% (thông thường) / 75% (gói CĐT HTLS)",
    thoi_han_vay_max: "40 năm (480 tháng)",
    lai_suat_tha_noi: "LSCS kỳ hạn 13 tháng OCB + Biên độ 3.00%/năm (điều chỉnh 6 tháng/lần)",
    phi_tra_truoc_han: "Năm 1-2: 1.50%, Năm 3: 2.50%, Năm 4-5: 1.50%, từ Năm 6: Miễn phí (0%). Tất toán min 1tr, trả 1 phần min 500k.",
    hoa_hong_moi_gioi: "0.2% giá trị khoản vay, tối đa 30 triệu đồng/khoản vay",
    ty_le_ban_cheo: "Tối thiểu 0.2%",
    ma_khuyen_mai: "1048 (UDTT_24M_GLADIA THE WATERS_T9.2026)",
    goi_htls: "Gói CĐT Khang Điền HTLS: 0%/năm 24 tháng (Gladia Heights cao tầng) hoặc 18 tháng (thấp tầng)",
  }, "cdt_gladia");

  // 3. BCONS GROUP
  addPolicy("prj_bcons", "pol_bcons_standard", "Chính sách vay Bcons Group (QĐ 693.01 Đợt 7)", {
    chu_dau_tu: "Bcons Group (Bcons City, Avenue, Solary, Plaza, Center City, Uni Valley...)",
    lai_suat_uu_dai: "LC1: 10.70%/năm (18T), LC2: 10.80%/năm (24T), LC3: 11.50%/năm (36T) theo QĐ 693.01",
    thoi_gian_uu_dai: "18 tháng (LC1), 24 tháng (LC2), 36 tháng (LC3)",
    an_han_goc: "Tối đa 36 tháng (thông thường) - lên đến 60 tháng",
    LTV_toi_da: "80% (nguồn thu Ưu tiên) / 75% (nguồn thu Tốt/Thường)",
    thoi_han_vay_max: "40 năm (480 tháng)",
    lai_suat_tha_noi: "LSCS kỳ hạn 13 tháng OCB + Biên độ 3.30%/năm (điều chỉnh 6 tháng/lần)",
    phi_tra_truoc_han: "LC1 (18M): Y1-2: 2.5%, Y3: 2.0%, Y4: 1.5%, Y5: 1.0%, Y6: 0%. LC2/LC3 (24M/36M): Y1-3: 2.5%, Y4: 1.5%, Y5: 1.0%, Y6: 0%.",
    hoa_hong_moi_gioi: "0.2% giá trị khoản vay, tối đa 30 triệu đồng/khoản vay",
    ty_le_ban_cheo: "Tối thiểu 0.2%",
    ma_khuyen_mai: "LC1: 1030 (UDTT_18M_BCONS_T9.2026), LC2: 1031 (UDTT_24M_BCONS_T9.2026), LC3: 1032 (UDTT_36M_BCONS_T9.2026)",
    luu_y: "Riêng dự án Khu nhà ở Phát Khang (Nhà phố Bcons Plaza/Bcons Uni Valley): chấp nhận cả trường hợp đã có GCN và chưa có GCN.",
  }, "cdt_bcons");

  // 4. PALM CITY / PALM RIVER
  addPolicy("prj_palm_river", "pol_palm_river_standard", "Chính sách vay Palm City / Palm River (QĐ 693.01 Đợt 7)", {
    chu_dau_tu: "Công ty TNHH Nam Rạch Chiếc",
    lai_suat_uu_dai: "LC1: 10.80%/năm (Cố định 24 tháng đầu theo QĐ 693.01); Từ 7.75%/năm nếu không HTLS",
    thoi_gian_uu_dai: "24 tháng đầu",
    an_han_goc: "Lên đến 60 tháng (5 năm). Trả gốc cuối kỳ cho KH Diamond/Diamond Elite (vay <= 20 năm)",
    LTV_toi_da: "80% giá trị BĐS (lên đến 100% nếu có thêm TSBĐ khác)",
    thoi_han_vay_max: "40 năm (480 tháng)",
    lai_suat_tha_noi: "LSCS kỳ hạn 13 tháng OCB + Biên độ 3.50%/năm (điều chỉnh 6 tháng/lần)",
    phi_tra_truoc_han: "Năm 1-3: 2.50%, Năm 4: 2.00%, Năm 5: 1.50%, từ Năm 6: Miễn phí (0%).",
    hoa_hong_moi_gioi: "Không chi hoa hồng tiền mặt. Tặng thẻ OCB World 2in1 hạn mức <= 400tr (miễn phí thường niên trọn đời) + Tài khoản số đẹp (Diamond Elite tặng TK 3 tỷ, Diamond tặng TK 1 tỷ, Gold tặng TK 500tr).",
    ty_le_ban_cheo: "Khuyến khích bán chéo, không bắt buộc",
    ma_khuyen_mai: "1066 (UDTT_24M_PALM CITY_T9.2026)",
  }, "cdt_nam_rach_chiec");

  // 6. Attributes: QUY ĐỊNH VAY VỐN CHUNG OCB
  insertAttribute.run("reg_ocb_lending_core", "dieu_kien_do_tuoi", "Từ 18 đến 75 tuổi khi hết hạn khoản vay BĐS (tiêu dùng tối đa 65 tuổi khi nhận nợ, vay SXKD từ 20 - 70 tuổi). Chủ TSBĐ bên thứ 3 tối đa 80 tuổi.");
  insertAttribute.run("reg_ocb_lending_core", "ty_le_cho_vay_ltv", "70% - 85% tùy nhóm nguồn thu (Ưu tiên: 85%, Tốt: 80%, Thông thường: 70%). CHỈ THỊ 729.01/2026: Giảm đồng loạt 5% LTV cho các khoản vay mới đến 31/12/2026 (trần thực tế 65% - 80%).");
  insertAttribute.run("reg_ocb_lending_core", "muc_thu_nhap_toi_thieu", "Tối thiểu 15 triệu đồng/tháng với vay mua BĐS; tối thiểu 10 triệu đồng/tháng với vay tiêu dùng có TSBĐ.");
  insertAttribute.run("reg_ocb_lending_core", "ty_le_dti_tra_no", "DTI tối đa 80% (Tổng nợ trả hàng tháng / Tổng thu nhập). Thu nhập ròng sau sinh hoạt tối thiểu đạt 110% nghĩa vụ nợ.");
  insertAttribute.run("reg_ocb_lending_core", "lich_su_no_xau_cic", "Không nợ Nhóm 2 trong 12 tháng gần nhất, không nợ Nhóm 3 trở lên trong 36 tháng gần nhất tại mọi TCTD; không có nợ VAMC. Ngoại lệ thẻ tín dụng: quá hạn Nhóm 2 (<30 ngày) tối đa 1 lần (KH thường) hoặc 3 lần (KH Diamond).");
  insertAttribute.run("reg_ocb_lending_core", "gioi_han_so_luong_tctd", "Tối đa quan hệ tín dụng tại 06 TCTD (trong đó tối đa 01 Công ty tài chính).");
  insertAttribute.run("reg_ocb_lending_core", "ho_so_phap_ly", "CCCD gắn chip (vợ chồng), Giấy đăng ký kết hôn hoặc Giấy xác nhận độc thân; Văn bản cam kết tài sản riêng có công chứng nếu vay riêng.");
  insertAttribute.run("reg_ocb_lending_core", "ho_so_muc_dich_vay", "Hợp đồng mua bán / Hợp đồng chuyển nhượng BĐS, biên lai cọc, phiếu thu tiền vốn tự có, biên bản thỏa thuận thanh toán.");
  insertAttribute.run("reg_ocb_lending_core", "ho_so_tai_san_bao_dam", "Sổ đỏ / Sổ hồng (hoặc HĐMB dự án + biên bản bàn giao), hợp đồng bảo hiểm cháy nổ bắt buộc.");
  insertAttribute.run("reg_ocb_lending_core", "ho_so_chung_minh_nguon_thu", "Lương: HĐLĐ + sao kê 3 tháng (hoặc bảng lương tiền mặt) + VssID. Cho thuê: Sổ hồng + HĐ thuê 1 năm + sao kê/biên nhận 3 tháng + ảnh thực tế. Hộ kinh doanh: ĐKKD + thuế + sổ sách doanh thu 3 tháng + 3 ảnh. Doanh nghiệp: ĐKKD 1 năm + BCTC/tờ khai thuế + biên bản chia cổ tức. Tiền gửi AUM: Sổ tiết kiệm từ 1 tỷ.");
  insertAttribute.run("reg_ocb_lending_core", "co_che_giai_ngan", "Giải ngân phong tỏa tài khoản bên bán mở tại OCB tối đa 45 ngày cho đến khi sang tên thế chấp thành công.");
  insertAttribute.run("reg_ocb_lending_core", "thoi_gian_an_han_goc_tb432", "Theo TB 432.01/2026/TB-TGĐ (hiệu lực 22/04/2026): KH định danh MASS, MAF2 hoặc chưa định danh KHÔNG áp dụng ân hạn gốc. Phân khúc khác vay mua BĐS có GCN: Vay <= 5 năm: Không ân hạn; Vay (5; 15] năm: Ân hạn tối đa 12 tháng; Vay > 15 năm: Ân hạn tối đa 18 tháng. Ngoại trừ các khoản vay BĐS dự án OCB tài trợ CĐT có chính sách HTLS riêng.");
  insertAttribute.run("reg_ocb_lending_core", "dia_ban_cap_tin_dung_tb432", "Theo TB 432.01/2026/TB-TGĐ (hiệu lực 18/05/2026): Phạm vi bán kính <= 80km tính từ trụ sở ĐVKD cho vay.");

  // 7. Attributes: THẺ TÍN DỤNG OCB
  insertAttribute.run("reg_ocb_credit_cards", "cac_dong_the_chinh", "1. OCB World 2in1 (Credit & Debit, hạn mức >=150tr, phí 1.999k, hoàn 10% ẩm thực & 5% du lịch/vé bay, hoàn max 5tr/kỳ, miễn phí trọn đời cho KHƯT/CBNV). 2. OCB Mastercard Platinum (hạn mức >=50tr, phí 999k, hoàn 15% công nghệ & làm đẹp, max 1.5tr/kỳ - 18tr/năm). 3. OCB JCB Platinum (hạn mức >=50tr, phí 999k, hoàn 15% y tế & bảo hiểm, max 1.5tr/kỳ). 4. OCB iGen Platinum (thẻ số, miễn phí năm đầu 100%, hoàn 12% Shopee/TikTok & 3% Apple/Google Pay, max 1tr/kỳ). 5. OCB Lifestyle (hạn mức 3-50tr, phí 399k, hoàn 12% giải trí Netflix/Spotify/CGV). 6. Các thẻ chuyên biệt: Doctor (y bác sĩ), Priority Banking (KHƯT miễn phí), Installment (chuyên trả góp).");
  insertAttribute.run("reg_ocb_credit_cards", "dieu_kien_mo_the_chung", "Độ tuổi 18-70. CIC sạch: không nợ nhóm 2 trong 12 tháng (chấp nhận 1 lần quá hạn thẻ <30 ngày và <1tr), không nợ nhóm 3-5 trong 24 tháng. Tối đa 5 TCTD cấp tín chấp (gồm OCB). Hạn mức phê duyệt tối thiểu từ 30 triệu trở lên (áp dụng từ 10/07/2026).");
  insertAttribute.run("reg_ocb_credit_cards", "4_phuong_thuc_mo_the", "1. Qua lương: Thu nhập từ 5tr/tháng. 2. Sang ngang thẻ NH khác: Thẻ cũ >=6 tháng, hạn mức >=20tr. 3. Sổ tiết kiệm OCB: Tín chấp số dư 3 tháng >=50tr hoặc cầm cố sổ (90% sổ). 4. Bất động sản: Sở hữu BĐS chính chủ từ 2 tỷ trở lên.");
  insertAttribute.run("reg_ocb_credit_cards", "chinh_sach_mien_phi_thuong_nien", "Năm 1: Hoàn phí khi chi tiêu tích lũy trong 45 ngày đầu: World 2in1 (chi 6tr), Platinum/Installment (chi 3tr), Lifestyle (chi 1tr). Riêng iGen và Doctor miễn phí năm 1 hoàn toàn. KHƯT và CBNV OCB miễn phí trọn đời.");
  insertAttribute.run("reg_ocb_credit_cards", "tra_gop_0_phan_tram", "Giao dịch từ 1 triệu trở lên. Đại lý liên kết: Miễn 100% lãi và phí chuyển đổi. Bảo hiểm Generali: Miễn phí trả góp 2 năm đầu.");

  // 8. Attributes: CHO VAY PHÂN KHÚC KHCN (QĐ 617.01/2026/QĐ-TGĐ)
  insertAttribute.run("reg_ocb_lending_qd617", "hieu_luc", "Từ 10/08/2026 đến hết 07/10/2026 cho tất cả KHCN Khối Bán lẻ OCB");
  insertAttribute.run("reg_ocb_lending_qd617", "vay_bds_sxkd_trung_dai_han", "LC1 (3M đầu): AFF 7.75%/năm (sau ưu đãi: LSCS 13T + 1.50%), MAF/PRE-AFF 9.75% (+3.25%), MASS 11.25% (+3.50%). LC2 (6M đầu): AFF 9.25% (+1.75%), MAF 11.25% (+3.50%), MASS 12.75% (+3.75%). LC3 (12M đầu): AFF 9.50% (+2.00%), MAF 11.50% (+3.75%), MASS 13.00% (+4.00%). Chu kỳ điều chỉnh: 6 tháng/lần.");
  insertAttribute.run("reg_ocb_lending_qd617", "vay_xe_va_tieu_dung_tsbd", "Lãi suất ưu đãi và biên độ thả nổi bằng Lãi suất BĐS + 0.50%/năm.");
  insertAttribute.run("reg_ocb_lending_qd617", "vay_sxkd_ngan_han", "KDLH 2.0 & Bổ sung VLĐ: LC2 (3-5M): AFF 7.70%, MAF 9.20%, MASS 10.20%. LC3 (>=6M): AFF 8.90%, MAF 10.40%, MASS 11.40%. LC4 (>=9M): AFF 9.10%, MAF 10.60%, MASS 11.60%.");
  insertAttribute.run("reg_ocb_lending_qd617", "phi_tra_truoc_han", "Năm 1-2: 2.5% - 3.0%, Năm 3: 2.0%, Năm 4: 1.5%, Năm 5: 1.0%, Từ năm 6 trở đi: Miễn phí (0%).");
  insertAttribute.run("reg_ocb_lending_qd617", "co_che_giam_lai_suat_ban_cheo", "Giảm 0.5% - 2.0% lãi suất cố định kỳ đầu theo tỷ lệ phí bán chéo X (X từ 1% đến >=4% số tiền giải ngân/hạn mức). Giảm 0.25% - 0.50% cho Hệ sinh thái đối tác OCB. Lãi suất sau giảm không thấp hơn LSCS + 0.50%.");

  // 9. Attributes: TIỀN GỬI & TIẾT KIỆM (HUY ĐỘNG VỐN)
  insertAttribute.run("sav_max_savings", "ten_san_pham", "Tiền gửi sinh lời tối ưu Max Savings (Thông báo số 798.01/2026/TB-TGĐ ngày 07/09/2026, hiệu lực từ 08/09/2026)");
  insertAttribute.run("sav_max_savings", "lai_suat_mo_moi_36t", "Mở mới kỳ hạn 36 tháng: Lĩnh lãi hàng 3 tháng hưởng 7.00%/năm; Lĩnh lãi hàng 6 tháng hưởng 8.00%/năm.");
  insertAttribute.run("sav_max_savings", "lai_suat_tai_tuc_hien_huu", "Sổ hiện hữu đến kỳ lĩnh lãi (36T): Lĩnh lãi hàng 3 tháng hưởng 8.50%/năm; Lĩnh lãi hàng 6 tháng hưởng 9.00%/năm.");
  insertAttribute.run("sav_max_savings", "han_muc_va_dieu_kien", "Tối thiểu 50 triệu VNĐ, tối đa 1 tỷ VNĐ/HĐTG (bội số 50tr). Rút trước hạn: chỉ được rút trước hạn toàn bộ TRƯỚC kỳ lĩnh lãi đầu tiên (hưởng lãi không kỳ hạn thấp nhất); sau kỳ đầu tiên tuyệt đối không được rút trước hạn.");

  insertAttribute.run("cctg_flexi_savings", "ten_san_pham", "Chứng chỉ tiền gửi Flexi Savings (Quyết định 815.01/2025/QĐ-TGĐ)");
  insertAttribute.run("cctg_flexi_savings", "lai_suat_sinh_loi", "Nắm giữ đủ 6 tháng: 9.00%/năm (lợi suất bậc thang cao nhất). Dưới 1 tháng: 5.6%/năm, 1-2 tháng: 6.8%/năm, 2-3 tháng: 7.3%/năm, 3-6 tháng: 7.6% - 7.7%/năm.");
  insertAttribute.run("cctg_flexi_savings", "tinh_nang_dac_biet", "Nhận lãi đều đặn vào ngày 01 hàng tháng. Mở và tất toán/chuyển nhượng trực tuyến từ 8h00 - 19h00 tất cả các ngày trong tuần (bao gồm cả Thứ 7 và Chủ nhật) ngay trên app OCB OMNI. Mệnh giá tối thiểu 100 triệu VNĐ (bội số 100tr).");

  insertAttribute.run("sav_floating_36m", "ten_san_pham", "Tiết kiệm 36 tháng lãi suất thả nổi OCB (Thông báo 798.01/2026/TB-TGĐ)");
  insertAttribute.run("sav_floating_36m", "lai_suat", "9.20%/năm (lĩnh lãi định kỳ 6 tháng một lần, áp dụng cho các sổ hiện hữu đến kỳ lĩnh lãi)");

  insertAttribute.run("sav_regular_deposit", "ten_san_pham", "Tiết kiệm thông thường OCB (Thông báo 716.01/2026/TB-TGĐ)");
  insertAttribute.run("sav_regular_deposit", "lai_suat_tai_quay", "Khách hàng ưu tiên (AFF/Pre-AFF): 6-9 tháng hưởng 8.40% - 8.50%/năm; 12 tháng hưởng 7.90% - 8.00%/năm. Phân khúc còn lại: 6-9 tháng hưởng 8.20%/năm; 12 tháng hưởng 7.70%/năm. Người cao tuổi (>=55 tuổi) được cộng thêm 0.20%/năm.");
  insertAttribute.run("sav_regular_deposit", "lai_suat_online_omni", "Kênh OCB OMNI: Diamond Elite hưởng tới 8.70%/năm (6-9M) và 8.20%/năm (12M). Diamond: 8.60% (6-9M). Gold: 8.50% (6-9M). Mass: 8.40% (6-9M).");

  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}
db.close();

console.log("✅ Đã tạo mới Knowledge Graph Database với duy nhất 4 dự án trọng tâm tại:", dbPath);
