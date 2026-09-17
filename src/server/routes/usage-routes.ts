import { Hono } from "hono";
import { db } from "../../conversation/database.js";
import { getCostGuardStatus } from "../../conversation/cost-guard.js";

export const usageRoutes = new Hono().get("/", (c) => {
  const row = db.prepare(`
    SELECT 
      COUNT(id) as totalRequests,
      SUM(input_tokens) as totalInputTokens,
      SUM(output_tokens) as totalOutputTokens,
      SUM(cached_input_tokens) as cachedTokens
    FROM agent_turns
  `).get() as any;

  const totalRequests = row.totalRequests || 0;
  const inputTokens = row.totalInputTokens || 0;
  const outputTokens = row.totalOutputTokens || 0;
  const cachedTokens = row.cachedTokens || 0;
  
  // Llama 3.1 70b on OpenRouter is usually $0.4 / 1M input, $0.4 / 1M output (approx)
  // Gemini 1.5 flash is $0.075 / 1M input, $0.3 / 1M output
  // We will average it or send it to frontend for calc. Let's do $0.4 as baseline.
  const costPerMillion = 0.4;
  const estCost = ((inputTokens + outputTokens) / 1000000) * costPerMillion;

  const costGuard = getCostGuardStatus();

  return c.json({
    totalRequests,
    totalInputTokens: inputTokens,
    totalOutputTokens: outputTokens,
    cachedTokens,
    cacheHitRate: inputTokens > 0 ? Number((cachedTokens / inputTokens).toFixed(4)) : 0,
    estCost: estCost.toFixed(4),
    costGuard
  });
});
