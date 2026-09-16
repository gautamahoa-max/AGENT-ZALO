/**
 * Cost Guard — Kiểm soát chi phí LLM theo giờ và ngày.
 *
 * Thiết kế:
 * - Đọc tổng token từ DB (agent_turns) theo cửa sổ thời gian
 * - So sánh với trần cấu hình (env)
 * - Gửi email cảnh báo ở ngưỡng (mặc định 80%) và chặn cứng ở 100%
 * - In-memory cache để tránh query DB mỗi turn
 *
 * Luồng:
 *   canStartTurn() → cho phép / chặn
 *   finishAgentTurn() → afterTurnCostCheck() → alert hoặc cập nhật cache
 */

import { db } from "./database.js";
import { sendSystemAlert } from "../shared/email-alert.js";
import { createLogger } from "../shared/logger.js";
import { env } from "../config/env.js";

const log = createLogger("cost-guard");

// ── Cấu hình từ env ──
const MAX_TOKENS_PER_HOUR = env.COST_GUARD_MAX_TOKENS_PER_HOUR;
const MAX_TOKENS_PER_DAY = env.COST_GUARD_MAX_TOKENS_PER_DAY;
const ALERT_THRESHOLD = env.COST_GUARD_ALERT_THRESHOLD;

// ── Cache in-memory ──
// Tránh query DB mỗi lượt: chỉ query lại khi cache hết hạn
let cachedHourlyTokens = 0;
let cachedDailyTokens = 0;
let lastCheckTime = 0;
const CHECK_INTERVAL_MS = 60_000; // Query DB tối đa 1 lần/phút

// ── Prepared statements ──
const hourlyStmt = db.prepare(`
  SELECT COALESCE(SUM(total_tokens), 0) AS total
  FROM agent_turns
  WHERE created_at >= datetime('now', '-1 hour')
`);

const dailyStmt = db.prepare(`
  SELECT COALESCE(SUM(total_tokens), 0) AS total
  FROM agent_turns
  WHERE created_at >= datetime('now', '-24 hours')
`);

/** Kết quả kiểm tra chi phí */
export type CostCheckResult = {
  allowed: boolean;
  hourlyTokens: number;
  dailyTokens: number;
  hourlyPercent: number;
  dailyPercent: number;
  reason?: string;
};

/**
 * Gọi SAU mỗi lượt agent để cập nhật cache và kiểm tra ngưỡng.
 * Gửi alert email nếu vượt ngưỡng cảnh báo.
 */
export function afterTurnCostCheck(turnTokens: number): void {
  cachedHourlyTokens += turnTokens;
  cachedDailyTokens += turnTokens;

  // Refresh cache từ DB nếu quá interval
  const now = Date.now();
  if (now - lastCheckTime > CHECK_INTERVAL_MS) {
    refreshFromDb();
    lastCheckTime = now;
  }

  // Kiểm tra ngưỡng cảnh báo giờ
  if (MAX_TOKENS_PER_HOUR > 0) {
    const pct = cachedHourlyTokens / MAX_TOKENS_PER_HOUR;
    if (pct >= ALERT_THRESHOLD && pct < 1.0) {
      log.warn(
        { hourlyTokens: cachedHourlyTokens, limit: MAX_TOKENS_PER_HOUR, pct: Math.round(pct * 100) },
        "Chi phí token theo giờ đạt ngưỡng cảnh báo",
      );
      void sendSystemAlert({
        alertKey: "cost_guard_hourly_warning",
        title: `Chi phí token đạt ${Math.round(pct * 100)}% trần giờ`,
        message: `Đã tiêu ${cachedHourlyTokens.toLocaleString()} / ${MAX_TOKENS_PER_HOUR.toLocaleString()} token trong 1 giờ qua. Kiểm tra xem có bị flood hoặc vòng lặp tool không.`,
        details: { hourlyTokens: cachedHourlyTokens, limit: MAX_TOKENS_PER_HOUR },
        dashboardUrl: "http://100.90.89.73:3900/usage",
      });
    }
  }

  // Kiểm tra ngưỡng cảnh báo ngày
  if (MAX_TOKENS_PER_DAY > 0) {
    const pct = cachedDailyTokens / MAX_TOKENS_PER_DAY;
    if (pct >= ALERT_THRESHOLD && pct < 1.0) {
      log.warn(
        { dailyTokens: cachedDailyTokens, limit: MAX_TOKENS_PER_DAY, pct: Math.round(pct * 100) },
        "Chi phí token theo ngày đạt ngưỡng cảnh báo",
      );
      void sendSystemAlert({
        alertKey: "cost_guard_daily_warning",
        title: `Chi phí token đạt ${Math.round(pct * 100)}% trần ngày`,
        message: `Đã tiêu ${cachedDailyTokens.toLocaleString()} / ${MAX_TOKENS_PER_DAY.toLocaleString()} token trong 24h qua.`,
        details: { dailyTokens: cachedDailyTokens, limit: MAX_TOKENS_PER_DAY },
        dashboardUrl: "http://100.90.89.73:3900/usage",
      });
    }
  }
}

/**
 * Gọi TRƯỚC mỗi lượt agent để kiểm tra có được phép chạy không.
 * Trả `allowed: false` khi đã chạm trần → caller trả lời khách "hệ thống bận".
 */
export function canStartTurn(): CostCheckResult {
  const now = Date.now();
  if (now - lastCheckTime > CHECK_INTERVAL_MS) {
    refreshFromDb();
    lastCheckTime = now;
  }

  const hourlyPct = MAX_TOKENS_PER_HOUR > 0 ? cachedHourlyTokens / MAX_TOKENS_PER_HOUR : 0;
  const dailyPct = MAX_TOKENS_PER_DAY > 0 ? cachedDailyTokens / MAX_TOKENS_PER_DAY : 0;

  const result: CostCheckResult = {
    allowed: true,
    hourlyTokens: cachedHourlyTokens,
    dailyTokens: cachedDailyTokens,
    hourlyPercent: Math.round(hourlyPct * 100),
    dailyPercent: Math.round(dailyPct * 100),
  };

  if (MAX_TOKENS_PER_HOUR > 0 && hourlyPct >= 1.0) {
    result.allowed = false;
    result.reason = `Đã vượt trần token theo giờ (${cachedHourlyTokens.toLocaleString()} / ${MAX_TOKENS_PER_HOUR.toLocaleString()})`;
    log.error(result, "CHẶN LƯỢT: vượt trần token theo giờ");
    void sendSystemAlert({
      alertKey: "cost_guard_hourly_blocked",
      title: "🚫 Đã CHẶN lượt agent — vượt trần token giờ",
      message: result.reason,
      dashboardUrl: "http://100.90.89.73:3900/usage",
    });
  } else if (MAX_TOKENS_PER_DAY > 0 && dailyPct >= 1.0) {
    result.allowed = false;
    result.reason = `Đã vượt trần token theo ngày (${cachedDailyTokens.toLocaleString()} / ${MAX_TOKENS_PER_DAY.toLocaleString()})`;
    log.error(result, "CHẶN LƯỢT: vượt trần token theo ngày");
    void sendSystemAlert({
      alertKey: "cost_guard_daily_blocked",
      title: "🚫 Đã CHẶN lượt agent — vượt trần token ngày",
      message: result.reason,
      dashboardUrl: "http://100.90.89.73:3900/usage",
    });
  }

  return result;
}

/** Đọc lại tổng token từ DB — nguồn sự thật duy nhất */
function refreshFromDb(): void {
  cachedHourlyTokens = (hourlyStmt.get() as { total: number }).total;
  cachedDailyTokens = (dailyStmt.get() as { total: number }).total;
}

/** Cho API endpoint /api/usage trả về trạng thái cost guard */
export function getCostGuardStatus(): {
  hourly: { used: number; limit: number; percent: number };
  daily: { used: number; limit: number; percent: number };
  blocked: boolean;
} {
  refreshFromDb();
  const hourlyPct = MAX_TOKENS_PER_HOUR > 0 ? Math.round((cachedHourlyTokens / MAX_TOKENS_PER_HOUR) * 100) : 0;
  const dailyPct = MAX_TOKENS_PER_DAY > 0 ? Math.round((cachedDailyTokens / MAX_TOKENS_PER_DAY) * 100) : 0;
  return {
    hourly: { used: cachedHourlyTokens, limit: MAX_TOKENS_PER_HOUR, percent: hourlyPct },
    daily: { used: cachedDailyTokens, limit: MAX_TOKENS_PER_DAY, percent: dailyPct },
    blocked: (MAX_TOKENS_PER_HOUR > 0 && hourlyPct >= 100) || (MAX_TOKENS_PER_DAY > 0 && dailyPct >= 100),
  };
}
