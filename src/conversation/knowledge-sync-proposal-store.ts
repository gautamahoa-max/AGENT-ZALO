import crypto from "node:crypto";
import { db } from "./database.js";

export type KnowledgeEntity = {
  id: string;
  type: string;
  name: string;
  attributes: Record<string, string>;
};

export type KnowledgeProposalStatus = "pending" | "applying" | "approved" | "rejected";

export type KnowledgeSyncProposal = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  notebookId: string;
  notebookTitle: string;
  changeSummary: string;
  personaRules: string[];
  entities: KnowledgeEntity[];
  status: KnowledgeProposalStatus;
  lastError: string;
  createdAt: string;
  decidedAt: string | null;
};

type Row = {
  id: string; source_id: string; source_title: string; notebook_id: string;
  notebook_title: string; change_summary: string; persona_rules_json: string;
  entities_json: string; status: KnowledgeProposalStatus; last_error: string;
  created_at: string; decided_at: string | null;
};

const parse = <T>(value: string, fallback: T): T => {
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const toProposal = (r: Row): KnowledgeSyncProposal => ({
  id: r.id,
  sourceId: r.source_id,
  sourceTitle: r.source_title,
  notebookId: r.notebook_id,
  notebookTitle: r.notebook_title,
  changeSummary: r.change_summary,
  personaRules: parse<string[]>(r.persona_rules_json, []),
  entities: parse<KnowledgeEntity[]>(r.entities_json, []),
  status: r.status,
  lastError: r.last_error,
  createdAt: r.created_at,
  decidedAt: r.decided_at,
});

export function saveKnowledgeProposal(input: Omit<KnowledgeSyncProposal, "id" | "status" | "lastError" | "createdAt" | "decidedAt">, replace = false): KnowledgeSyncProposal {
  const existing = getKnowledgeProposalBySource(input.sourceId);
  if (existing && !replace) return existing;
  const id = existing?.id ?? crypto.randomUUID();
  db.prepare(`
    INSERT INTO knowledge_sync_proposals (
      id, source_id, source_title, notebook_id, notebook_title, change_summary,
      persona_rules_json, entities_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      source_title=excluded.source_title, notebook_id=excluded.notebook_id,
      notebook_title=excluded.notebook_title, change_summary=excluded.change_summary,
      persona_rules_json=excluded.persona_rules_json, entities_json=excluded.entities_json,
      status='pending', last_error='', decided_at=NULL,
      created_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).run(id, input.sourceId, input.sourceTitle, input.notebookId, input.notebookTitle,
    input.changeSummary, JSON.stringify(input.personaRules), JSON.stringify(input.entities));
  return getKnowledgeProposalBySource(input.sourceId)!;
}

export function getKnowledgeProposal(id: string): KnowledgeSyncProposal | null {
  const row = db.prepare("SELECT * FROM knowledge_sync_proposals WHERE id = ?").get(id) as Row | undefined;
  return row ? toProposal(row) : null;
}

export function getKnowledgeProposalBySource(sourceId: string): KnowledgeSyncProposal | null {
  const row = db.prepare("SELECT * FROM knowledge_sync_proposals WHERE source_id = ?").get(sourceId) as Row | undefined;
  return row ? toProposal(row) : null;
}

export function listKnowledgeProposals(limit = 50): KnowledgeSyncProposal[] {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const rows = db.prepare(`
    SELECT * FROM knowledge_sync_proposals
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'applying' THEN 1 ELSE 2 END, created_at DESC
    LIMIT ?
  `).all(safeLimit) as unknown as Row[];
  return rows.map(toProposal);
}

export function claimKnowledgeProposal(id: string): KnowledgeSyncProposal | null {
  const result = db.prepare(`
    UPDATE knowledge_sync_proposals SET status='applying', last_error=''
    WHERE id=? AND status='pending'
  `).run(id);
  return Number(result.changes) > 0 ? getKnowledgeProposal(id) : null;
}

export function markKnowledgeProposalApproved(id: string): void {
  db.prepare(`UPDATE knowledge_sync_proposals SET status='approved', decided_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_error='' WHERE id=? AND status='applying'`).run(id);
}

export function releaseKnowledgeProposal(id: string, error: string): void {
  db.prepare("UPDATE knowledge_sync_proposals SET status='pending', last_error=? WHERE id=? AND status='applying'")
    .run(error.slice(0, 1000), id);
}

export function rejectKnowledgeProposal(id: string): boolean {
  const result = db.prepare(`
    UPDATE knowledge_sync_proposals SET status='rejected', decided_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_error=''
    WHERE id=? AND status='pending'
  `).run(id);
  return Number(result.changes) > 0;
}
