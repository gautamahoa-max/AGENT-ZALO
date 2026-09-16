import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveDynamicKBs,
  readCorePersona,
  clearKBCache,
} from "./dynamic-kb-router.js";

describe("dynamic-kb-router", () => {
  beforeEach(() => {
    clearKBCache();
  });

  describe("readCorePersona", () => {
    it("reads core-persona.md and returns non-empty string", () => {
      const core = readCorePersona();
      assert.ok(core.length > 0, "Core persona should not be empty");
      assert.ok(
        core.includes("Hoà"),
        "Core persona should contain identity 'Hoà'",
      );
      assert.ok(
        core.includes("RED FLAGS"),
        "Core persona should contain Red Flags section",
      );
    });

    it("caches content on second read", () => {
      const first = readCorePersona();
      const second = readCorePersona();
      assert.strictEqual(first, second);
    });
  });

  describe("resolveDynamicKBs", () => {
    it("returns empty when message is casual greeting", () => {
      const result = resolveDynamicKBs({
        latestMessages: ["Xin chào, bạn khoẻ không?"],
      });
      assert.strictEqual(result.contents.length, 0);
      assert.strictEqual(result.matched.length, 0);
    });

    it("matches KB1 mortgage when keywords mention vay/mua nhà", () => {
      const result = resolveDynamicKBs({
        latestMessages: ["Tôi muốn vay mua nhà 3 tỷ"],
      });
      assert.ok(result.matched.some((m) => m.file === "kb-mortgage.md"));
      assert.ok(
        result.contents.some((c) => c.includes("KHÁCH VAY MUA NHÀ")),
      );
    });

    it("matches KB2 broker when keywords mention môi giới", () => {
      const result = resolveDynamicKBs({
        latestMessages: ["Anh ơi khách của em cần check CIC gấp"],
      });
      assert.ok(result.matched.some((m) => m.file === "kb-broker.md"));
    });

    it("matches KB3 credit card when keywords mention thẻ tín dụng", () => {
      const result = resolveDynamicKBs({
        latestMessages: ["Em muốn mở thẻ tín dụng OCB"],
      });
      assert.ok(result.matched.some((m) => m.file === "kb-credit-card.md"));
    });

    it("matches KB9 objections when keywords mention lãi cao", () => {
      const result = resolveDynamicKBs({
        latestMessages: ["Lãi cao thế, ngân hàng khác rẻ hơn mà"],
      });
      assert.ok(result.matched.some((m) => m.file === "kb-objections.md"));
    });

    it("matches KB10 loan policies when keywords mention bảo hiểm", () => {
      const result = resolveDynamicKBs({
        latestMessages: ["Có bắt buộc mua bảo hiểm nhân thọ không?"],
      });
      assert.ok(result.matched.some((m) => m.file === "kb-loan-policies.md"));
    });

    it("matches KB11 townhouse when keywords mention nhà phố", () => {
      const result = resolveDynamicKBs({
        latestMessages: ["Tôi muốn vay mua nhà phố ở Quận 7"],
      });
      assert.ok(result.matched.some((m) => m.file === "kb-townhouse.md"));
    });

    it("matches KB11 townhouse when keywords mention sổ hồng", () => {
      const result = resolveDynamicKBs({
        latestMessages: ["Nhà có sổ hồng rồi, vay được bao nhiêu?"],
      });
      assert.ok(result.matched.some((m) => m.file === "kb-townhouse.md"));
    });

    it("matches KB11 townhouse when keywords mention đất nền", () => {
      const result = resolveDynamicKBs({
        latestMessages: ["Em ơi anh muốn mua đất nền ở Long An"],
      });
      assert.ok(result.matched.some((m) => m.file === "kb-townhouse.md"));
    });

    it("matches KB11 townhouse for đất nông nghiệp queries", () => {
      const result = resolveDynamicKBs({
        latestMessages: ["Đất nông nghiệp có vay được không em?"],
      });
      assert.ok(result.matched.some((m) => m.file === "kb-townhouse.md"));
    });

    it("matches KB4-8 situations when keywords mention hẹn gặp", () => {
      const result = resolveDynamicKBs({
        latestMessages: ["Mình hẹn gặp cà phê được không?"],
      });
      assert.ok(result.matched.some((m) => m.file === "kb-situations.md"));
    });

    it("prioritizes label_match over keyword_match", () => {
      const result = resolveDynamicKBs({
        latestMessages: ["cho em hỏi về thẻ tín dụng"],
        threadLabels: ["Môi giới BĐS"],
      });
      // Label match (Môi giới → kb-broker) should come first
      assert.strictEqual(result.matched[0].file, "kb-broker.md");
      assert.strictEqual(result.matched[0].priority, "label_match");
    });

    it("limits to MAX_DYNAMIC_KBS (3)", () => {
      // Message that triggers many KBs at once
      const result = resolveDynamicKBs({
        latestMessages: [
          "Tôi muốn vay mua nhà, khách của em cần check CIC, mở thẻ tín dụng, lãi cao thế, bảo hiểm nhân thọ",
        ],
      });
      assert.ok(
        result.matched.length <= 3,
        `Should match at most 3, got ${result.matched.length}`,
      );
      assert.ok(
        result.contents.length <= 3,
        `Should return at most 3 contents, got ${result.contents.length}`,
      );
    });

    it("triggers KB6 (return customer) when lastCustomerMsgAgeMs > 48h", () => {
      const result = resolveDynamicKBs({
        latestMessages: ["Em ơi"],
        lastCustomerMsgAgeMs: 49 * 60 * 60 * 1000, // 49 hours
      });
      assert.ok(result.matched.some((m) => m.file === "kb-situations.md"));
      assert.ok(
        result.matched.some((m) => m.priority === "time_trigger"),
      );
    });

    it("does not duplicate kb-situations when both keyword and time trigger match", () => {
      const result = resolveDynamicKBs({
        latestMessages: ["Mình hẹn gặp cà phê"],
        lastCustomerMsgAgeMs: 49 * 60 * 60 * 1000,
      });
      const situationMatches = result.matched.filter(
        (m) => m.file === "kb-situations.md",
      );
      assert.strictEqual(
        situationMatches.length,
        1,
        "Should not duplicate kb-situations",
      );
    });
  });
});
