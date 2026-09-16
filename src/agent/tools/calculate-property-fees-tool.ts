import { tool } from "ai";
import { z } from "zod";
import { pino } from "pino";

const log = pino({ name: "tool:calculate-property-fees" });

export function createCalculatePropertyFeesTool() {
  return tool({
    description:
      "Tính nhanh các khoản thuế phí chuyển nhượng, lệ phí trước bạ, phí công chứng và phí liên quan khi mua bán chuyển nhượng Bất động sản tại Việt Nam.",
    inputSchema: z.object({
      property_price: z.number().describe("Giá trị hợp đồng chuyển nhượng / Giá mua bán nhà đất (VNĐ), VD: 2500000000"),
      property_type: z.enum(["apartment", "land_house"]).default("apartment").describe("Loại hình: Căn hộ chung cư hoặc Nhà phố/Đất nền"),
      is_first_house: z.boolean().default(false).describe("Có phải căn nhà duy nhất hay không"),
    }),
    execute: async ({ property_price, property_type = "apartment", is_first_house = false }) => {
      try {
        // 1. Thuế TNCN: 2% giá trị chuyển nhượng (Bên bán đóng, trừ khi thỏa thuận)
        const thueTNCN = is_first_house ? 0 : property_price * 0.02;

        // 2. Lệ phí trước bạ: 0.5% (Bên mua đóng, tối đa 500tr/tài sản)
        const lePhiTruocBa = Math.min(500_000_000, property_price * 0.005);

        // 3. Phí công chứng hợp đồng mua bán theo Thông tư 257/2016/TT-BTC:
        let phiCongChung = 0;
        if (property_price <= 50_000_000) phiCongChung = 50_000;
        else if (property_price <= 100_000_000) phiCongChung = 100_000;
        else if (property_price <= 1_000_000_000) phiCongChung = property_price * 0.001;
        else if (property_price <= 3_000_000_000) phiCongChung = 1_000_000 + (property_price - 1_000_000_000) * 0.0006;
        else if (property_price <= 5_000_000_000) phiCongChung = 2_200_000 + (property_price - 3_000_000_000) * 0.0005;
        else if (property_price <= 10_000_000_000) phiCongChung = 3_200_000 + (property_price - 5_000_000_000) * 0.0004;
        else phiCongChung = Math.min(70_000_000, 5_200_000 + (property_price - 10_000_000_000) * 0.0003);

        // 4. Phí đo vẽ / trích lục / thẩm định hồ sơ & cấp đổi sổ (ước tính):
        const phiCapSo = property_type === "apartment" ? 1_500_000 : 3_500_000;

        const tongChiPhi = thueTNCN + lePhiTruocBa + phiCongChung + phiCapSo;

        const toTr = (n: number) => (n / 1_000_000).toFixed(2) + " triệu VNĐ";
        const toTy = (n: number) => (n / 1_000_000_000).toFixed(2) + " tỷ VNĐ";

        const summary = `BẢNG TÍNH THUẾ PHÍ MUA BÁN BĐS (${toTy(property_price)}):
1. Thuế TNCN (2% - thường bên bán): ${is_first_house ? "Miễn thuế (Căn duy nhất)" : toTr(thueTNCN)}
2. Lệ phí trước bạ (0.5% - bên mua): ${toTr(lePhiTruocBa)}
3. Phí công chứng hợp đồng mua bán: ~${toTr(phiCongChung)}
4. Lệ phí cấp đổi/đăng bộ sổ hồng: ~${toTr(phiCapSo)}
👉 TỔNG THUẾ PHÍ ƯỚC TÍNH: ~${toTr(tongChiPhi)} (Chiếm khoảng ~${((tongChiPhi / property_price) * 100).toFixed(1)}% giá trị BĐS).`;

        log.info({ property_price, tongChiPhi }, "Đã tính toán thuế phí BĐS");
        return `KẾT QUẢ TÍNH THUẾ PHÍ:\n${summary}\n\nHÃY TRẢ LỜI KHÁCH NGẮN GỌN (≤ 3 DÒNG), NÊU TỔNG CHI PHÍ VÀ LỆ PHÍ TRƯỚC BẠ BÊN MUA CẦN CHUẨN BỊ.`;
      } catch (err: any) {
        log.error({ err }, "Lỗi khi tính thuế phí BĐS");
        return `Lỗi tính thuế phí: ${err.message || err}`;
      }
    },
  });
}
