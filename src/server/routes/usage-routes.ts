import { Hono } from "hono";
import { db } from "../../conversation/database.js";
import { getCostGuardStatus } from "../../conversation/cost-guard.js";

export const usageRoutes = new Hono().get("/", (c) => {
  const row = db.prepare(`
    SELECT 
      COUNT(id) as totalRequests,
      SUM(input_tokens) as totalInputTokens,
      SUM(output_tokens) as totalOutputTokens
    FROM agent_turns
  `).get() as any;

  const totalRequests = row.totalRequests || 0;
  const inputTokens = row.totalInputTokens || 0;
  const outputTokens = row.totalOutputTokens || 0;
  const cachedTokens = 0; // Gemini / Llama might not track this in DB yet
  
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
    estCost: estCost.toFixed(4),
    costGuard
  });
});
