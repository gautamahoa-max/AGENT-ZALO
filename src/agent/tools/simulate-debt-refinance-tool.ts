import { tool } from "ai";
import { z } from "zod";
import type { ToolContext } from "./index.js";
import { ketQuaLoi } from "./tool-failure-result.js";

const MO_TA = [
  "Công cụ mô phỏng Chuyển nợ / Đảo nợ liên ngân hàng (Refinancing Simulator).",
  "Dùng khi khách hàng đang vay ở ngân hàng khác với lãi suất cao và muốn tính toán xem",
  "nếu chuyển khoản vay đó sang OCB thì sẽ tiết kiệm được bao nhiêu tiền lãi,",
  "cũng như điểm hòa vốn (bù đắp phí phạt bên cũ) là bao lâu.",
].join("\n");

export function createSimulateDebtRefinanceTool({ account, message }: ToolContext) {
  return tool({
    description: MO_TA,
    inputSchema: z.object({
      current_debt: z.number().describe("Dư nợ hiện tại ở ngân hàng cũ (VNĐ)"),
      current_interest_rate: z.number().describe("Lãi suất hiện tại ở ngân hàng cũ (%/năm)"),
      remaining_months: z.number().describe("Thời gian vay còn lại ở ngân hàng cũ (tháng)"),
      old_bank_penalty_rate: z
        .number()
        .describe("Phí phạt tất toán trước hạn ở ngân hàng cũ (% trên dư nợ, thường 1-3%)"),
      ocb_interest_rate: z.number().describe("Lãi suất ưu đãi khi chuyển sang OCB (%/năm)"),
      ocb_grace_period_months: z
        .number()
        .optional()
        .describe("Thời gian ân hạn gốc dự kiến ở OCB (tháng) - mặc định 0 nếu không rõ"),
    }),
    execute: async ({
      current_debt,
      current_interest_rate,
      remaining_months,
      old_bank_penalty_rate,
      ocb_interest_rate,
      ocb_grace_period_months = 0,
    }) => {
      try {
        const penaltyFee = current_debt * (old_bank_penalty_rate / 100);
        const oldMonthlyInterest = current_debt * (current_interest_rate / 100 / 12);
        const newMonthlyInterest = current_debt * (ocb_interest_rate / 100 / 12);
        const monthlyInterestSavings = oldMonthlyInterest - newMonthlyInterest;
        const oldMonthlyPrincipal = remaining_months > 0 ? current_debt / remaining_months : 0;
        const newMonthlyPrincipal = ocb_grace_period_months > 0 ? 0 : oldMonthlyPrincipal;
        const oldTotalMonthlyPayment = oldMonthlyInterest + oldMonthlyPrincipal;
        const newTotalMonthlyPayment = newMonthlyInterest + newMonthlyPrincipal;
        const monthlyCashflowSavings = oldTotalMonthlyPayment - newTotalMonthlyPayment;
        let breakEvenMonths = 0;
        if (monthlyInterestSavings > 0) {
          breakEvenMonths = penaltyFee / monthlyInterestSavings;
        }
        const formatCurrency = (val: number) =>
          new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val);

        return {
          chuan_doan: "Thành công",
          ket_qua: {
            du_no_hien_tai: formatCurrency(current_debt),
            phi_phat_bank_cu: formatCurrency(penaltyFee),
            tiet_kiem_lai_moi_thang: formatCurrency(monthlyInterestSavings),
            tiet_kiem_lai_1_nam: formatCurrency(monthlyInterestSavings * 12),
            giam_tai_dong_tien_moi_thang: formatCurrency(monthlyCashflowSavings),
            thoi_gian_hoa_von_phi_phat:
              monthlyInterestSavings > 0
                ? `${Math.ceil(breakEvenMonths)} tháng`
                : "Không hòa vốn (Lãi OCB cao hơn)",
            loi_khuyen:
              monthlyInterestSavings > 0
                ? `Khách hàng chỉ mất ${Math.ceil(breakEvenMonths)} tháng tiền tiết kiệm lãi để bù đắp phí phạt tất toán bên cũ.`
                : "Giữ nguyên bên ngân hàng cũ sẽ có lợi hơn.",
          },
        };
      } catch (err: any) {
        return ketQuaLoi(`Lỗi tính toán chuyển nợ: ${err?.message || err}`);
      }
    },
  });
}
