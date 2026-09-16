import { tool } from "ai";
import { z } from "zod";
import { pino } from "pino";

const log = pino({ name: "tool:evaluate-loan-eligibility" });

export function createEvaluateLoanEligibilityTool() {
  return tool({
    description:
      "Thẩm định sơ bộ hạn mức và điều kiện vay vốn ngân hàng theo quy tắc kép LTV (tài sản) và DTI (thu nhập). Tự động tính toán số tiền vay tối đa, số tiền mặt còn thiếu hoặc thu nhập còn thiếu.",
    inputSchema: z.object({
      property_value: z.number().describe("Giá trị bất động sản / căn hộ (VNĐ), VD: 3000000000"),
      desired_loan_amount: z.number().optional().describe("Số tiền khách muốn vay (VNĐ), VD: 2000000000"),
      monthly_income: z.number().describe("Thu nhập thực tế hàng tháng của khách hàng (VNĐ), VD: 35000000"),
      loan_term_years: z.number().default(20).describe("Thời hạn vay tính theo năm (mặc định 20 năm, tối đa 40 năm)"),
      interest_rate_percent: z.number().default(10.5).describe("Lãi suất năm dự kiến (mặc định 10.5%/năm)"),
      max_ltv_percent: z.number().default(70).describe("Tỷ lệ cho vay tối đa trên giá trị tài sản (mặc định 70%, tối đa 80%)"),
      max_dti_percent: z.number().default(75).describe("Tỷ lệ DTI tối đa (nghĩa vụ trả nợ / thu nhập, quy định DTI < 80%, mặc định 75%)"),
    }),
    execute: async ({
      property_value,
      desired_loan_amount,
      monthly_income,
      loan_term_years = 20,
      interest_rate_percent = 10.5,
      max_ltv_percent = 70,
      max_dti_percent = 75,
    }) => {
      try {
        const totalMonths = loan_term_years * 12;
        const maxLtvDec = Math.min(0.8, max_ltv_percent / 100);
        const maxDtiDec = Math.min(0.799, max_dti_percent / 100);
        const monthlyRate = interest_rate_percent / 100 / 12;

        // 1. Hạn mức tối đa theo tài sản (LTV)
        const maxLoanByLTV = property_value * maxLtvDec;

        // 2. Hạn mức tối đa theo thu nhập (DTI < 80%)
        const maxMonthlyPaymentAllowed = monthly_income * maxDtiDec;
        const factorPerVnd = (1 / totalMonths) + monthlyRate;
        const maxLoanByDTI = maxMonthlyPaymentAllowed / factorPerVnd;

        // 3. Hạn mức cho vay thực tế tối đa (MIN của cả hai)
        const maxLoanActual = Math.min(maxLoanByLTV, maxLoanByDTI);

        // Khách muốn vay
        const targetLoan = desired_loan_amount || maxLoanActual;
        const isEligible = targetLoan <= maxLoanActual;

        const reqGocT1 = targetLoan / totalMonths;
        const reqLaiT1 = targetLoan * monthlyRate;
        const reqTotalT1 = reqGocT1 + reqLaiT1;
        const actualDTI = (reqTotalT1 / monthly_income) * 100;

        // Định dạng tiền tệ
        const toTy = (n: number) => (n / 1_000_000_000).toFixed(2) + " tỷ";
        const toTr = (n: number) => (n / 1_000_000).toFixed(1) + " triệu";

        let summary = "";
        if (isEligible) {
          summary = `KẾT QUẢ THẨM ĐỊNH: ĐỦ ĐIỀU KIỆN VAY.
- Giá trị nhà: ${toTy(property_value)}
- Khoản vay: ${toTy(targetLoan)} (${((targetLoan / property_value) * 100).toFixed(0)}% LTV - Trong trần cho phép)
- Kỳ hạn: ${loan_term_years} năm
- Trả tháng 1 đỉnh: ~${toTr(reqTotalT1)} (Gốc ~${toTr(reqGocT1)} + Lãi ~${toTr(reqLaiT1)})
- Tỷ lệ DTI: ${actualDTI.toFixed(1)}% (Thỏa điều kiện DTI < 80%)
- Vốn tự có khách cần chuẩn bị: ${toTy(property_value - targetLoan)}`;
        } else {
          const lackCash = targetLoan - maxLoanByLTV;
          const lackIncome = (reqTotalT1 / maxDtiDec) - monthly_income;
          summary = `KẾT QUẢ THẨM ĐỊNH: CHƯA ĐỦ ĐIỀU KIỆN KHOẢN VAY ${toTy(targetLoan)}.
- Hạn mức tối đa được vay: ${toTy(maxLoanActual)} (Bị chặn bởi ${maxLoanByLTV < maxLoanByDTI ? "Tài sản đảm bảo LTV" : "Thu nhập DTI"})
${lackCash > 0 ? `- Thiếu vốn tự có: Cần thêm tối thiểu ${toTr(lackCash)} tiền mặt.` : ""}
${lackIncome > 0 ? `- Thiếu thu nhập: Cần tăng thêm ~${toTr(lackIncome)}/tháng (hoặc thêm người đồng vay) để DTI < 80%.` : ""}
- Phương án tối ưu: Vay ở mức an toàn ${toTy(maxLoanActual)}, tháng đầu trả ~${toTr(maxMonthlyPaymentAllowed)}.`;
        }

        log.info({ property_value, desired_loan_amount, isEligible, maxLoanActual }, "Đã thẩm định điều kiện vay");
        return `KẾT QUẢ TÍNH TOÁN TỰ ĐỘNG:\n${summary}\n\nHÃY DÙNG KẾT QUẢ TRÊN ĐỂ TRẢ LỜI KHÁCH NGẮN GỌN (≤ 3 DÒNG), KHÔNG CẦN TÍNH LẠI.`;
      } catch (err: any) {
        log.error({ err }, "Lỗi thẩm định điều kiện vay");
        return `Lỗi khi thẩm định: ${err.message || err}`;
      }
    },
  });
}
