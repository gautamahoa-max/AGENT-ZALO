import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentProfile } from "../config/agent-store.js";
import { isLightweightTurn, routeModelForTurn } from "./model-router.js";

const msg = (text: string, images: unknown[] = []) => ({ text, images });
const agent = { modelName: null } as AgentProfile;

describe("model router", () => {
  it("chỉ dùng model nhanh cho lời xã giao whitelist", () => {
    assert.equal(isLightweightTurn([msg("Dạ cảm ơn anh!")]), true);
    assert.equal(routeModelForTurn({ agent, batch: [msg("Xin chào")], fastModel: "flash-lite", isolated: false }).tier, "fast");
  });
  it("nội dung nghiệp vụ, có ảnh hoặc lịch hẹn luôn dùng model chính", () => {
    assert.equal(isLightweightTurn([msg("Ok chốt gặp cà phê sáng mai")]), false);
    assert.equal(isLightweightTurn([msg("Lãi suất vay 3 tỷ là bao nhiêu?")]), false);
    assert.equal(isLightweightTurn([msg("chào", [{}])]), false);
    assert.equal(routeModelForTurn({ agent, batch: [msg("chào")], fastModel: "flash-lite", isolated: true }).tier, "main");
  });
  it("model riêng của agent không bị routing ghi đè", () => {
    const pinned = { ...agent, modelName: "model-rieng" };
    const routed = routeModelForTurn({ agent: pinned, batch: [msg("hello")], fastModel: "flash-lite", isolated: false });
    assert.equal(routed.agent.modelName, "model-rieng");
    assert.equal(routed.tier, "main");
  });
});
