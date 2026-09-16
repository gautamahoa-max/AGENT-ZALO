import { tool } from "ai";
import { z } from "zod";
import { pino } from "pino";

const log = pino({ name: "tool:recommend-credit-card" });

type CardInfo = {
  name: string;
  cashbackHighlight: string;
  maxCashbackYear: string;
  keyFeature: string;
  annualFee: string;
  suitableSegment: string;
  fastApprovalCode: string;
};

const OCB_CARDS: Record<string, CardInfo> = {
  igen: {
    name: "OCB iGen Mastercard",
    cashbackHighlight: "Hoàn 12% khi mua sắm online (Shopee, Tiki, Lazada, TikTok Shop, Grab, Be...)",
    maxCashbackYear: "12 triệu VNĐ/năm",
    keyFeature: "Phát hành thẻ số 100% online nhận dùng ngay, miễn phí thường niên năm đầu",
    annualFee: "299.000 VNĐ (miễn phí khi đạt doanh số)",
    suitableSegment: "Khách hàng trẻ, chuộng mua sắm online, săn sale sàn TMĐT",
    fastApprovalCode: "N13/N14 (Lương ≥5tr) hoặc N17 (Sang ngang thẻ khác)",
  },
  lifestyle: {
    name: "OCB Lifestyle Mastercard",
    cashbackHighlight: "Hoàn 12% cho Ăn uống, Ẩm thực, Nhà hàng, Rạp chiếu phim, Giải trí cuối tuần",
    maxCashbackYear: "12 triệu VNĐ/năm",
    keyFeature: "Ưu đãi ẩm thực độc quyền tại hơn 500 nhà hàng đối tác",
    annualFee: "499.000 VNĐ",
    suitableSegment: "Khách thích tụ tập bạn bè, gia đình ăn uống, cafe, xem phim",
    fastApprovalCode: "N13/N14 hoặc N17",
  },
  platinum: {
    name: "OCB Mastercard Platinum Cashback",
    cashbackHighlight: "Hoàn 15% cho Làm đẹp, Spa, Gym, Chăm sóc sức khỏe, Nha khoa",
    maxCashbackYear: "18 triệu VNĐ/năm (Cao nhất phân khúc Platinum)",
    keyFeature: "Bảo hiểm du lịch toàn cầu tới 11 tỷ, trả góp 0% linh hoạt",
    annualFee: "999.000 VNĐ",
    suitableSegment: "Chị em phụ nữ, khách quan tâm sức khỏe, fitness, làm đẹp",
    fastApprovalCode: "N15 (Sở hữu BĐS ≥2tỷ) hoặc N17 (Thẻ hạn mức ≥20tr)",
  },
  jcb: {
    name: "OCB JCB Platinum",
    cashbackHighlight: "Hoàn 15% cho Bệnh viện, Tiệm thuốc, Bảo hiểm nhân thọ & phi nhân thọ",
    maxCashbackYear: "15 triệu VNĐ/năm",
    keyFeature: "Đặc quyền phòng chờ sân bay quốc tế Nhật Bản & giảm giá chuỗi ẩm thực Nhật",
    annualFee: "800.000 VNĐ",
    suitableSegment: "Khách đóng phí bảo hiểm hàng năm, chi tiêu y tế hoặc hay đi Nhật",
    fastApprovalCode: "N15 hoặc N17",
  },
  world_2in1: {
    name: "OCB World Pass / World 2in1",
    cashbackHighlight: "Hoàn 5 - 10% vé máy bay, khách sạn, ẩm thực cao cấp",
    maxCashbackYear: "Không giới hạn",
    keyFeature: "Phí giao dịch ngoại tệ siêu rẻ 0.9% (Thấp nhất VN), Tặng Vali cao cấp, Phòng chờ VIP sân bay",
    annualFee: "1.999.000 VNĐ (Tặng kèm thẻ phụ)",
    suitableSegment: "Khách VIP, Doanh nhân, hay đi công tác nước ngoài / du lịch quốc tế",
    fastApprovalCode: "N15 (BĐS cao cấp / Vay OCB) hoặc Hạng MAF+ / HM ≥50tr",
  },
};

export function createRecommendCreditCardTool() {
  return tool({
    description:
      "Tư vấn và đề xuất dòng thẻ tín dụng OCB phù hợp nhất dựa theo hành vi chi tiêu (mua sắm online, ăn uống, làm đẹp, du lịch, bảo hiểm) kèm chính sách hoàn tiền và diện cấp nhanh.",
    inputSchema: z.object({
      spending_habit: z
        .enum(["online_shopping", "dining_entertainment", "beauty_healthcare", "insurance_medical", "travel_overseas"])
        .describe("Hành vi / Nhu cầu chi tiêu chính của khách hàng"),
      has_existing_card: z.boolean().default(false).describe("Khách đã có thẻ tín dụng ngân hàng khác hay chưa"),
      has_property: z.boolean().default(false).describe("Khách có sở hữu nhà/đất/căn hộ hay không"),
    }),
    execute: async ({ spending_habit, has_existing_card, has_property }) => {
      try {
        let cardKey = "igen";
        if (spending_habit === "online_shopping") cardKey = "igen";
        else if (spending_habit === "dining_entertainment") cardKey = "lifestyle";
        else if (spending_habit === "beauty_healthcare") cardKey = "platinum";
        else if (spending_habit === "insurance_medical") cardKey = "jcb";
        else if (spending_habit === "travel_overseas") cardKey = "world_2in1";

        const card = OCB_CARDS[cardKey];

        let fastPath = card.fastApprovalCode;
        if (has_property) {
          fastPath = "Cấp diện N15 (Khách sở hữu BĐS ≥2 tỷ - Thủ tục nhanh trong 24h)";
        } else if (has_existing_card) {
          fastPath = "Cấp diện N17 (Sang ngang từ thẻ ngân hàng khác - Chỉ cần ảnh mặt trước thẻ & CCCD)";
        }

        const summary = `ĐỀ XUẤT THẺ TÍN DỤNG OCB PHÙ HỢP NHẤT:
- Dòng thẻ: ${card.name}
- Ưu đãi nổi bật: ${card.cashbackHighlight} (Tối đa ${card.maxCashbackYear})
- Đặc quyền: ${card.keyFeature}
- Diện cấp nhanh ưu tiên: ${fastPath}
- Gợi ý gửi kèm: Dùng tool send_file gửi ảnh 'qr_the_tin_dung_ocb.png' để khách quét xem cẩm nang thẻ.`;

        log.info({ spending_habit, cardKey }, "Đã đề xuất dòng thẻ OCB");
        return `KẾT QUẢ TƯ VẤN THẺ:\n${summary}\n\nHÃY TRẢ LỜI KHÁCH NGẮN GỌN (≤ 3 DÒNG), NÊU ĐÚNG ƯU ĐÃI HOÀN TIỀN VÀ MỜI MỞ THẺ.`;
      } catch (err: any) {
        log.error({ err }, "Lỗi khi tư vấn thẻ");
        return `Lỗi tư vấn thẻ: ${err.message || err}`;
      }
    },
  });
}
