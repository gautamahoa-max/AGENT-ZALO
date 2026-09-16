import { db } from "./database.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("experiment-store");

export type ExperimentStatus = "draft" | "running" | "paused" | "completed";

export type Experiment = {
  id: string;
  name: string;
  description: string;
  agentId: string;
  status: ExperimentStatus;
  variantAName: string;
  variantAPersona: string;
  variantBName: string;
  variantBPersona: string;
  trafficRatio: number;
  createdAt: string;
  endedAt: string | null;
};

type Row = {
  id: string;
  name: string;
  description: string;
  agent_id: string;
  status: string;
  variant_a_name: string;
  variant_a_persona: string;
  variant_b_name: string;
  variant_b_persona: string;
  traffic_ratio: number;
  created_at: string;
  ended_at: string | null;
};

const toExperiment = (r: Row): Experiment => ({
  id: r.id,
  name: r.name,
  description: r.description,
  agentId: r.agent_id,
  status: r.status as ExperimentStatus,
  variantAName: r.variant_a_name,
  variantAPersona: r.variant_a_persona,
  variantBName: r.variant_b_name,
  variantBPersona: r.variant_b_persona,
  trafficRatio: r.traffic_ratio,
  createdAt: r.created_at,
  endedAt: r.ended_at,
});

export function createExperiment(data: {
  id: string;
  name: string;
  description?: string;
  agentId: string;
  variantAName?: string;
  variantAPersona: string;
  variantBName?: string;
  variantBPersona: string;
  trafficRatio?: number;
}): Experiment {
  db.prepare(
    `INSERT INTO experiments (id, name, description, agent_id, status, variant_a_name, variant_a_persona, variant_b_name, variant_b_persona, traffic_ratio)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
  ).run(
    data.id,
    data.name,
    data.description ?? "",
    data.agentId,
    data.variantAName ?? "Variant A (Gốc)",
    data.variantAPersona,
    data.variantBName ?? "Variant B (Thử nghiệm)",
    data.variantBPersona,
    data.trafficRatio ?? 50,
  );

  log.info({ experimentId: data.id }, "Tạo thử nghiệm A/B mới");
  return getExperiment(data.id)!;
}

export function getExperiment(id: string): Experiment | null {
  const row = db.prepare("SELECT * FROM experiments WHERE id = ?").get(id) as Row | undefined;
  return row ? toExperiment(row) : null;
}

export function listExperiments(): Experiment[] {
  const rows = db.prepare("SELECT * FROM experiments ORDER BY created_at DESC").all() as Row[];
  return rows.map(toExperiment);
}

/**
 * Tìm thử nghiệm đang CHẠY (status = 'running') cho agent này (nếu có).
 */
export function getActiveExperimentForAgent(agentId: string): Experiment | null {
  const row = db
    .prepare("SELECT * FROM experiments WHERE agent_id = ? AND status = 'running' LIMIT 1")
    .get(agentId) as Row | undefined;
  return row ? toExperiment(row) : null;
}

export function updateExperiment(
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    status: ExperimentStatus;
    variantAName: string;
    variantAPersona: string;
    variantBName: string;
    variantBPersona: string;
    trafficRatio: number;
  }>,
): Experiment | null {
  const current = getExperiment(id);
  if (!current) return null;

  const endedAt = patch.status === "completed" && !current.endedAt ? new Date().toISOString() : current.endedAt;

  db.prepare(
    `UPDATE experiments
     SET name = COALESCE(?, name),
         description = COALESCE(?, description),
         status = COALESCE(?, status),
         variant_a_name = COALESCE(?, variant_a_name),
         variant_a_persona = COALESCE(?, variant_a_persona),
         variant_b_name = COALESCE(?, variant_b_name),
         variant_b_persona = COALESCE(?, variant_b_persona),
         traffic_ratio = COALESCE(?, traffic_ratio),
         ended_at = ?
     WHERE id = ?`,
  ).run(
    patch.name ?? null,
    patch.description ?? null,
    patch.status ?? null,
    patch.variantAName ?? null,
    patch.variantAPersona ?? null,
    patch.variantBName ?? null,
    patch.variantBPersona ?? null,
    patch.trafficRatio ?? null,
    endedAt,
    id,
  );

  log.info({ experimentId: id, patch }, "Cập nhật thử nghiệm A/B");
  return getExperiment(id);
}

export function deleteExperiment(id: string): { ok: boolean; reason?: string } {
  const exp = getExperiment(id);
  if (!exp) return { ok: false, reason: "Thử nghiệm không tồn tại" };
  if (exp.status === "running") {
    return { ok: false, reason: "Không thể xóa thử nghiệm đang chạy. Vui lòng dừng hoặc hoàn tất trước." };
  }

  db.prepare("DELETE FROM experiment_assignments WHERE experiment_id = ?").run(id);
  db.prepare("DELETE FROM experiments WHERE id = ?").run(id);
  log.info({ experimentId: id }, "Đã xóa thử nghiệm A/B");
  return { ok: true };
}

/**
 * Sticky Session Assignment: Phân bổ khách hàng/thread vào Variant A hoặc Variant B.
 * Nếu thread đã từng được gán cho thử nghiệm này -> Giữ nguyên variant cũ.
 * Nếu chưa -> Gán ngẫu nhiên theo tỷ lệ trafficRatio (default: 50%).
 */
export function assignVariantForThread(
  experimentId: string,
  threadId: string,
  trafficRatio = 50,
): "A" | "B" {
  const existing = db
    .prepare("SELECT variant FROM experiment_assignments WHERE experiment_id = ? AND thread_id = ?")
    .get(experimentId, threadId) as { variant: "A" | "B" } | undefined;

  if (existing) {
    return existing.variant;
  }

  // Phân bổ mới: trafficRatio là % gán cho B (ví dụ 50 = 50% B, 50% A)
  const isB = Math.random() * 100 < trafficRatio;
  const variant: "A" | "B" = isB ? "B" : "A";

  db.prepare(
    "INSERT OR IGNORE INTO experiment_assignments (experiment_id, thread_id, variant) VALUES (?, ?, ?)",
  ).run(experimentId, threadId, variant);

  log.info({ experimentId, threadId, variant }, "Phân bổ thread vào variant A/B");
  return variant;
}

export type VariantStats = {
  threads: number;
  turns: number;
  tokens: number;
  leads: number;
  appointments: number;
  conversionRate: number;
};

export type ExperimentMetrics = {
  experiment: Experiment;
  variantA: VariantStats;
  variantB: VariantStats;
};

/**
 * Tổng hợp số liệu so sánh hiệu quả giữa Variant A và Variant B.
 */
export function getExperimentMetrics(experimentId: string): ExperimentMetrics | null {
  const exp = getExperiment(experimentId);
  if (!exp) return null;

  const turnsRows = db
    .prepare(
      `SELECT experiment_variant,
              COUNT(DISTINCT thread_id) AS threads,
              COUNT(id) AS turns,
              COALESCE(SUM(total_tokens), 0) AS tokens
       FROM agent_turns
       WHERE experiment_id = ?
       GROUP BY experiment_variant`,
    )
    .all(experimentId) as {
    experiment_variant: string;
    threads: number;
    turns: number;
    tokens: number;
  }[];

  const leadsRows = db
    .prepare(
      `SELECT experiment_variant,
              COUNT(id) AS leads,
              SUM(CASE WHEN interest_type = 'hen_gap_cafe' OR status = 'appointment_booked' THEN 1 ELSE 0 END) AS appointments
       FROM leads
       WHERE experiment_id = ?
       GROUP BY experiment_variant`,
    )
    .all(experimentId) as {
    experiment_variant: string;
    leads: number;
    appointments: number;
  }[];

  const buildStats = (variant: "A" | "B"): VariantStats => {
    const t = turnsRows.find((r) => r.experiment_variant === variant) ?? {
      threads: 0,
      turns: 0,
      tokens: 0,
    };
    const l = leadsRows.find((r) => r.experiment_variant === variant) ?? {
      leads: 0,
      appointments: 0,
    };
    const threads = t.threads || 0;
    const leads = l.leads || 0;
    const conversionRate = threads > 0 ? Number(((leads / threads) * 100).toFixed(1)) : 0;

    return {
      threads,
      turns: t.turns || 0,
      tokens: t.tokens || 0,
      leads,
      appointments: l.appointments || 0,
      conversionRate,
    };
  };

  return {
    experiment: exp,
    variantA: buildStats("A"),
    variantB: buildStats("B"),
  };
}
