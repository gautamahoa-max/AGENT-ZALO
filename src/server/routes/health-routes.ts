/**
 * Health & Metrics endpoints cho monitoring bên ngoài.
 *
 * GET /api/health       → 200 nếu sống, 503 nếu lỗi
 * GET /api/metrics      → Text format kiểu Prometheus
 */

import { Hono } from "hono";
import { db } from "../../conversation/database.js";
import { getRunningAccounts } from "../../zalo/account-manager.js";
import { getCostGuardStatus } from "../../conversation/cost-guard.js";

export const healthRoutes = new Hono();

// ── GET /api/health ──
healthRoutes.get("/health", (c) => {
  try {
    // Smoke test: DB còn truy vấn được không?
    db.prepare("SELECT 1").get();
    const accounts = getRunningAccounts();
    return c.json({
      status: "ok",
      uptime: Math.floor(process.uptime()),
      accounts: accounts.length,
      memoryMB: Math.round(process.memoryUsage.rss() / 1024 / 1024),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return c.json({ status: "error", message: "DB không truy cập được" }, 503);
  }
});

// ── GET /api/metrics ──
healthRoutes.get("/metrics", (c) => {
  const mem = process.memoryUsage();
  const accounts = getRunningAccounts();
  
  let costGuard;
  try {
    costGuard = getCostGuardStatus();
  } catch {
    costGuard = { hourly: { percent: 0 }, daily: { percent: 0 }, blocked: false };
  }

  let hourRow = { turns: 0, tokens: 0 };
  let dayRow = { turns: 0, tokens: 0 };
  
  try {
    hourRow = db.prepare(`
      SELECT COUNT(*) as turns, COALESCE(SUM(total_tokens), 0) as tokens
      FROM agent_turns WHERE created_at >= datetime('now', '-1 hour')
    `).get() as { turns: number; tokens: number };

    dayRow = db.prepare(`
      SELECT COUNT(*) as turns, COALESCE(SUM(total_tokens), 0) as tokens
      FROM agent_turns WHERE created_at >= datetime('now', '-24 hours')
    `).get() as { turns: number; tokens: number };
  } catch { /* Bỏ qua nếu DB bận */ }

  const lines = [
    "# HELP zalo_agent_uptime_seconds Process uptime in seconds",
    "# TYPE zalo_agent_uptime_seconds gauge",
    `zalo_agent_uptime_seconds ${Math.floor(process.uptime())}`,
    "",
    "# HELP zalo_agent_memory_rss_bytes Resident set size in bytes",
    "# TYPE zalo_agent_memory_rss_bytes gauge",
    `zalo_agent_memory_rss_bytes ${mem.rss}`,
    "",
    "# HELP zalo_agent_memory_heap_used_bytes Heap used in bytes",
    "# TYPE zalo_agent_memory_heap_used_bytes gauge",
    `zalo_agent_memory_heap_used_bytes ${mem.heapUsed}`,
    "",
    "# HELP zalo_agent_accounts_active Number of active Zalo accounts",
    "# TYPE zalo_agent_accounts_active gauge",
    `zalo_agent_accounts_active ${accounts.length}`,
    "",
    "# HELP zalo_agent_turns_1h Agent turns in last hour",
    "# TYPE zalo_agent_turns_1h gauge",
    `zalo_agent_turns_1h ${hourRow.turns}`,
    "",
    "# HELP zalo_agent_tokens_1h Total tokens consumed in last hour",
    "# TYPE zalo_agent_tokens_1h gauge",
    `zalo_agent_tokens_1h ${hourRow.tokens}`,
    "",
    "# HELP zalo_agent_turns_24h Agent turns in last 24 hours",
    "# TYPE zalo_agent_turns_24h gauge",
    `zalo_agent_turns_24h ${dayRow.turns}`,
    "",
    "# HELP zalo_agent_tokens_24h Total tokens consumed in last 24 hours",
    "# TYPE zalo_agent_tokens_24h gauge",
    `zalo_agent_tokens_24h ${dayRow.tokens}`,
    "",
    "# HELP zalo_agent_cost_guard_hourly_percent Cost guard hourly usage percent",
    "# TYPE zalo_agent_cost_guard_hourly_percent gauge",
    `zalo_agent_cost_guard_hourly_percent ${costGuard.hourly.percent}`,
    "",
    "# HELP zalo_agent_cost_guard_daily_percent Cost guard daily usage percent",
    "# TYPE zalo_agent_cost_guard_daily_percent gauge",
    `zalo_agent_cost_guard_daily_percent ${costGuard.daily.percent}`,
    "",
    "# HELP zalo_agent_cost_guard_blocked Whether agent is blocked by cost guard",
    "# TYPE zalo_agent_cost_guard_blocked gauge",
    `zalo_agent_cost_guard_blocked ${costGuard.blocked ? 1 : 0}`,
    "",
  ];

  c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return c.text(lines.join("\n"));
});
