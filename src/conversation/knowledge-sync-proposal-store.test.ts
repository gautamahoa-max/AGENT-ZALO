import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";
import { cleanupTestEnv, setupTestEnv } from "../shared/test-env-setup.js";

let dataDir: string;
let store: typeof import("./knowledge-sync-proposal-store.js");

before(async () => {
  dataDir = setupTestEnv();
  store = await import("./knowledge-sync-proposal-store.js");
});

after(async () => {
  const { closeDatabase } = await import("./database.js");
  closeDatabase();
  cleanupTestEnv(dataDir);
});

const input = (sourceId: string) => ({
  sourceId,
  sourceTitle: "Quy định thử nghiệm",
  notebookId: "nb-1",
  notebookTitle: "Quy định OCB",
  changeSummary: "Cập nhật điều kiện",
  personaRules: ["Không cam kết khi chưa thẩm định"],
  entities: [{ id: "policy-test", type: "POLICY", name: "Chính sách thử", attributes: { hieu_luc: "2026-12-31" } }],
});

describe("knowledge-sync-proposal-store", () => {
  it("chỉ một caller claim được đề xuất", () => {
    const proposal = store.saveKnowledgeProposal(input("source-claim"));
    assert.equal(store.claimKnowledgeProposal(proposal.id)?.status, "applying");
    assert.equal(store.claimKnowledgeProposal(proposal.id), null);
  });

  it("duyệt chỉ áp dụng sau thao tác rõ ràng và không nhân đôi persona", async () => {
    const proposal = store.saveKnowledgeProposal(input("source-approve"));
    const service = await import("../services/notebooklm-sync-service.js");
    assert.deepEqual(service.approveKnowledgeProposal(proposal.id), { ok: true });
    assert.equal(store.getKnowledgeProposal(proposal.id)?.status, "approved");

    const personaPath = path.join(dataDir, "personas", "core-persona.md");
    const persona = fs.readFileSync(personaPath, "utf-8");
    assert.equal(persona.split(`notebooklm-proposal:${proposal.id}`).length - 1, 2, "marker mở/đóng đúng một block");

    const graph = new DatabaseSync(path.join(dataDir, "banking-graph.db"), { readOnly: true });
    const entity = graph.prepare("SELECT name FROM entities WHERE id='policy-test'").get() as { name: string };
    graph.close();
    assert.equal(entity.name, "Chính sách thử");
    assert.throws(() => service.approveKnowledgeProposal(proposal.id), /không còn ở trạng thái/);
  });

  it("từ chối giữ nguyên KB", async () => {
    const proposal = store.saveKnowledgeProposal(input("source-reject"));
    const service = await import("../services/notebooklm-sync-service.js");
    assert.deepEqual(service.rejectKnowledgeSyncProposal(proposal.id), { ok: true });
    assert.equal(store.getKnowledgeProposal(proposal.id)?.status, "rejected");
  });
});
