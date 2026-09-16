import { db } from "./database.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("persona-version-store");

export type PersonaVersion = {
  id: number;
  agentId: string;
  version: number;
  persona: string;
  name: string;
  modelName: string | null;
  modelProvider: string | null;
  changeNote: string;
  createdBy: string;
  createdAt: string;
};

type Row = {
  id: number;
  agent_id: string;
  version: number;
  persona: string;
  name: string;
  model_name: string | null;
  model_provider: string | null;
  change_note: string;
  created_by: string;
  created_at: string;
};

const toVersion = (r: Row): PersonaVersion => ({
  id: r.id,
  agentId: r.agent_id,
  version: r.version,
  persona: r.persona,
  name: r.name,
  modelName: r.model_name,
  modelProvider: r.model_provider,
  changeNote: r.change_note,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

/**
 * Ghi lại một snapshot phiên bản persona mới cho agent.
 * Tự động tăng version (1, 2, 3...).
 */
export function recordPersonaVersion(
  agentId: string,
  data: {
    persona: string;
    name: string;
    modelName?: string | null;
    modelProvider?: string | null;
  },
  changeNote = "",
  createdBy = "dashboard",
): PersonaVersion {
  const row = db
    .prepare("SELECT COALESCE(MAX(version), 0) + 1 AS next_ver FROM agent_persona_versions WHERE agent_id = ?")
    .get(agentId) as { next_ver: number };
  const nextVersion = row.next_ver;

  const res = db
    .prepare(
      `INSERT INTO agent_persona_versions (agent_id, version, persona, name, model_name, model_provider, change_note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      agentId,
      nextVersion,
      data.persona,
      data.name,
      data.modelName ?? null,
      data.modelProvider ?? null,
      changeNote,
      createdBy,
    );

  log.info({ agentId, version: nextVersion }, "Đã lưu snapshot phiên bản persona mới");

  return {
    id: Number(res.lastInsertRowid),
    agentId,
    version: nextVersion,
    persona: data.persona,
    name: data.name,
    modelName: data.modelName ?? null,
    modelProvider: data.modelProvider ?? null,
    changeNote,
    createdBy,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Lấy danh sách tất cả các phiên bản của agent (mới nhất trước).
 */
export function listPersonaVersions(agentId: string): PersonaVersion[] {
  const rows = db
    .prepare(
      `SELECT id, agent_id, version, persona, name, model_name, model_provider, change_note, created_by, created_at
       FROM agent_persona_versions
       WHERE agent_id = ?
       ORDER BY version DESC`,
    )
    .all(agentId) as Row[];

  return rows.map(toVersion);
}

/**
 * Lấy chi tiết một phiên bản cụ thể.
 */
export function getPersonaVersion(agentId: string, version: number): PersonaVersion | null {
  const row = db
    .prepare(
      `SELECT id, agent_id, version, persona, name, model_name, model_provider, change_note, created_by, created_at
       FROM agent_persona_versions
       WHERE agent_id = ? AND version = ?`,
    )
    .get(agentId, version) as Row | undefined;

  return row ? toVersion(row) : null;
}

/**
 * Khôi phục persona của agent về phiên bản chỉ định.
 * Đồng thời ghi lại một bản ghi phiên bản mới với ghi chú rollback.
 */
export function rollbackPersonaVersion(
  agentId: string,
  targetVersion: number,
  actor = "dashboard",
): { ok: boolean; version?: PersonaVersion; reason?: string } {
  const target = getPersonaVersion(agentId, targetVersion);
  if (!target) {
    return { ok: false, reason: `Không tìm thấy phiên bản v${targetVersion}` };
  }

  const agentRow = db.prepare("SELECT id FROM agents WHERE id = ?").get(agentId);
  if (!agentRow) {
    return { ok: false, reason: "Agent không tồn tại" };
  }

  // Cập nhật lại agent trong database
  db.prepare("UPDATE agents SET persona = ?, name = ? WHERE id = ?").run(
    target.persona,
    target.name,
    agentId,
  );

  // Ghi lại snapshot mới cho thao tác rollback
  const newVer = recordPersonaVersion(
    agentId,
    {
      persona: target.persona,
      name: target.name,
      modelName: target.modelName,
      modelProvider: target.modelProvider,
    },
    `Rollback về phiên bản v${targetVersion}`,
    actor,
  );

  log.warn({ agentId, fromVersion: agentId, targetVersion, newVersion: newVer.version }, "Đã khôi phục phiên bản persona");

  return { ok: true, version: newVer };
}
