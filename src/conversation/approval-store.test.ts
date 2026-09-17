import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { cleanupTestEnv, setupTestEnv } from "../shared/test-env-setup.js";

let dataDir: string;
let store: typeof import("./approval-store.js");

before(async () => {
  dataDir = setupTestEnv();
  store = await import("./approval-store.js");
});

after(async () => {
  (await import("./database.js")).closeDatabase();
  cleanupTestEnv(dataDir);
});

describe("approval-store", () => {
  it("chỉ một caller giành được quyền gửi", () => {
    store.savePendingApproval({
      id: "a-1",
      filePath: "/tmp/a.xlsx",
      caption: "Bảng tính",
      threadId: "t-1",
      threadType: 0,
      accountId: "acc-1",
    });

    assert.equal(store.claimPendingApproval("a-1")?.status, "sending");
    assert.equal(store.claimPendingApproval("a-1"), null);
    store.markApprovalSent("a-1");
    assert.equal(store.getApproval("a-1")?.status, "sent");
  });

  it("yêu cầu hết hạn không thể claim", () => {
    store.savePendingApproval({
      id: "a-expired",
      filePath: "/tmp/b.xlsx",
      caption: "Bảng tính",
      threadId: "t-2",
      threadType: 0,
      accountId: "acc-1",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    assert.equal(store.getApproval("a-expired")?.status, "expired");
    assert.equal(store.claimPendingApproval("a-expired"), null);
  });
});
