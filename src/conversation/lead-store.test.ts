import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { setupTestEnv } from "../shared/test-env-setup.js";

setupTestEnv();

let leadStore: typeof import("./lead-store.js");

before(async () => {
  leadStore = await import("./lead-store.js");
});

describe("Lead & ROI Store (C5)", () => {
  it("trích xuất đúng giá trị số VNĐ từ văn bản tự nhiên", () => {
    assert.equal(leadStore.parseVndAmount("Vay 3.5 tỷ"), 3_500_000_000);
    assert.equal(leadStore.parseVndAmount("Căn 2PN 2.2 tỷ"), 2_200_000_000);
    assert.equal(leadStore.parseVndAmount("Vay 300 tr"), 300_000_000);
    assert.equal(leadStore.parseVndAmount("Hạn mức thẻ 50 triệu"), 50_000_000);
    assert.equal(leadStore.parseVndAmount("Cần tư vấn"), 0);
  });

  it("tạo hồ sơ Lead VIP thành công và tự động ước tính doanh thu NIM", () => {
    const lead = leadStore.createLead({
      accountId: "acc-bank",
      threadId: "t-lead-1",
      customerName: "Anh Hoàng OCB",
      interestType: "vay_mua_nha",
      estimatedValue: "Vay 4 tỷ mua Palm City",
      details: "Thu nhập 60tr/tháng, cần vay 4 tỷ",
      actionNeeded: "Hẹn cafe sáng thứ 7",
      urgency: "cao",
      experimentId: "exp-test",
      experimentVariant: "B",
    });

    assert.ok(lead.id > 0);
    assert.equal(lead.customerName, "Anh Hoàng OCB");
    assert.equal(lead.loanAmountVnd, 4_000_000_000);
    // 0.8% của 4 tỷ = 32,000,000 VND
    assert.equal(lead.expectedRevenueVnd, 32_000_000);
    assert.equal(lead.status, "qualified");
    assert.equal(lead.experimentVariant, "B");
  });

  it("cập nhật trạng thái lead sang đã giải ngân và ghi nhận doanh thu thực tế", () => {
    const list = leadStore.listLeads({ limit: 1 });
    assert.ok(list.items.length > 0);
    const first = list.items[0];

    const updated = leadStore.updateLeadStatus(first.id, {
      status: "disbursed",
      actualRevenueVnd: 35_000_000,
    });

    assert.ok(updated);
    assert.equal(updated.status, "disbursed");
    assert.equal(updated.actualRevenueVnd, 35_000_000);
  });

  it("tổng hợp báo cáo ROI tài chính", () => {
    const roi = leadStore.getRoiSummary();
    assert.ok(roi);
    assert.ok(typeof roi.totalLlmCostVnd === "number");
    assert.ok(typeof roi.totalLeads === "number");
    assert.ok(Array.isArray(roi.funnel));
    assert.ok(Array.isArray(roi.productBreakdown));
  });
});
