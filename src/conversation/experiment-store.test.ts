import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { setupTestEnv } from "../shared/test-env-setup.js";

setupTestEnv();

let experimentStore: typeof import("./experiment-store.js");
let db: typeof import("./database.js").db;

before(async () => {
  experimentStore = await import("./experiment-store.js");
  db = (await import("./database.js")).db;
});

describe("Experiment Store (A/B Testing C1)", () => {
  const agentId = "agent-test-ab-" + Date.now();
  const expId = "exp-test-" + Date.now();

  it("tạo thử nghiệm mới và lưu vào database", () => {
    const exp = experimentStore.createExperiment({
      id: expId,
      name: "Thử nghiệm chào hỏi",
      agentId,
      variantAName: "Gốc",
      variantAPersona: "Bạn là trợ lý thân thiện.",
      variantBName: "The Privé",
      variantBPersona: "Bạn là chuyên viên BĐS The Privé.",
      trafficRatio: 50,
    });

    assert.equal(exp.id, expId);
    assert.equal(exp.status, "draft");
    assert.equal(exp.trafficRatio, 50);
  });

  it("getActiveExperimentForAgent chỉ trả về khi status = running", () => {
    let active = experimentStore.getActiveExperimentForAgent(agentId);
    assert.equal(active, null); // Đang là draft

    experimentStore.updateExperiment(expId, { status: "running" });
    active = experimentStore.getActiveExperimentForAgent(agentId);
    assert.ok(active);
    assert.equal(active.id, expId);
    assert.equal(active.status, "running");
  });

  it("sticky session assignment: cùng 1 threadId luôn nhận cùng 1 variant", () => {
    const threadId = "thread-12345";
    const variant1 = experimentStore.assignVariantForThread(expId, threadId, 50);
    assert.ok(variant1 === "A" || variant1 === "B");

    // Lần gọi thứ 2 cho cùng threadId
    const variant2 = experimentStore.assignVariantForThread(expId, threadId, 50);
    assert.equal(variant2, variant1);

    // Lần gọi thứ 3
    const variant3 = experimentStore.assignVariantForThread(expId, threadId, 50);
    assert.equal(variant3, variant1);
  });

  it("tổng hợp metrics so sánh Variant A và Variant B", () => {
    // Giả lập 1 turn vào agent_turns
    db.prepare(
      `INSERT INTO agent_turns (account_id, thread_id, experiment_id, experiment_variant, total_tokens, steps)
       VALUES ('acc-1', 'thread-12345', ?, 'A', 500, 2)`,
    ).run(expId);

    const metrics = experimentStore.getExperimentMetrics(expId);
    assert.ok(metrics);
    assert.equal(metrics.variantA.turns, 1);
    assert.equal(metrics.variantA.tokens, 500);
    assert.equal(metrics.variantA.threads, 1);
  });
});
