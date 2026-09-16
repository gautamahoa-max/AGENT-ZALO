import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { setupTestEnv } from "../shared/test-env-setup.js";

setupTestEnv();

let personaVersionStore: typeof import("./persona-version-store.js");
let db: typeof import("./database.js").db;

before(async () => {
  personaVersionStore = await import("./persona-version-store.js");
  db = (await import("./database.js")).db;
});

describe("Persona Version Store (C3)", () => {
  const testAgentId = "test-agent-version-" + Date.now();

  it("ghi nhận phiên bản persona mới và tự tăng số version", () => {
    // Tạo mock agent trong DB
    db.prepare("INSERT OR IGNORE INTO agents (id, name, persona) VALUES (?, ?, ?)").run(
      testAgentId,
      "Test Agent",
      "Persona v1 ban đầu",
    );

    const v1 = personaVersionStore.recordPersonaVersion(
      testAgentId,
      { persona: "Persona v1 ban đầu", name: "Test Agent" },
      "Khởi tạo",
    );
    assert.equal(v1.version, 1);
    assert.equal(v1.persona, "Persona v1 ban đầu");

    const v2 = personaVersionStore.recordPersonaVersion(
      testAgentId,
      { persona: "Persona v2 cải tiến phong cách", name: "Test Agent Pro" },
      "Cải tiến phong cách",
    );
    assert.equal(v2.version, 2);
    assert.equal(v2.persona, "Persona v2 cải tiến phong cách");
  });

  it("lấy danh sách các phiên bản theo thứ tự mới nhất trước", () => {
    const list = personaVersionStore.listPersonaVersions(testAgentId);
    assert.ok(list.length >= 2);
    assert.equal(list[0].version, 2);
    assert.equal(list[1].version, 1);
  });

  it("khôi phục (rollback) về phiên bản cũ thành công", () => {
    const res = personaVersionStore.rollbackPersonaVersion(testAgentId, 1);
    assert.equal(res.ok, true);
    assert.ok(res.version);
    assert.equal(res.version.version, 3); // Snapshot rollback ghi nhận version 3
    assert.equal(res.version.persona, "Persona v1 ban đầu");

    // Kiểm tra trong agents table xem đã được cập nhật chưa
    const row = db.prepare("SELECT persona FROM agents WHERE id = ?").get(testAgentId) as {
      persona: string;
    };
    assert.equal(row.persona, "Persona v1 ban đầu");
  });
});
