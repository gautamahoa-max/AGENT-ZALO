import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { policyValiditySection } from "./policy-validity.js";

describe("policyValiditySection", () => {
  it("đánh dấu chính sách đang còn hiệu lực", () => {
    const text = policyValiditySection("Asia/Ho_Chi_Minh", new Date("2026-09-17T01:00:00Z"));
    assert.match(text, /617[\s\S]*hiệu lực đến hết 2026-10-07/);
    assert.match(text, /693[\s\S]*hiệu lực đến hết 2026-12-31/);
  });

  it("fail closed sau ngày hết hiệu lực", () => {
    const text = policyValiditySection("Asia/Ho_Chi_Minh", new Date("2027-01-01T01:00:00Z"));
    assert.match(text, /617[\s\S]*ĐÃ HẾT HIỆU LỰC/);
    assert.match(text, /693[\s\S]*ĐÃ HẾT HIỆU LỰC/);
  });
});
