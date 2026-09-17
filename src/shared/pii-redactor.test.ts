import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactPII } from "./pii-redactor.js";

describe("redactPII", () => {
  it("che dữ liệu định danh và tài chính trong text", () => {
    const output = redactPII(
      "SĐT 0901234567, CCCD 012345678901, email hoa@example.com, STK: 1234567890123, MST 0312345678",
    );
    assert.ok(!output.includes("0901234567"));
    assert.ok(!output.includes("012345678901"));
    assert.ok(!output.includes("hoa@example.com"));
    assert.ok(!output.includes("1234567890123"));
    assert.ok(!output.includes("0312345678"));
  });

  it("không che số tiền thông thường khi không có nhãn tài khoản", () => {
    assert.equal(redactPII("Khách muốn vay 3500000000 đồng"), "Khách muốn vay 3500000000 đồng");
  });
});
