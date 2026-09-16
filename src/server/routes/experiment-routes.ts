import { Hono } from "hono";
import { z } from "zod";
import {
  createExperiment,
  deleteExperiment,
  getExperiment,
  getExperimentMetrics,
  listExperiments,
  updateExperiment,
} from "../../conversation/experiment-store.js";
import { getAgent } from "../../config/agent-store.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger("experiment-routes");

const createSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "id phải là kebab-case"),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  agentId: z.string().min(1),
  variantAName: z.string().min(1).max(100).optional(),
  variantAPersona: z.string().max(50_000),
  variantBName: z.string().min(1).max(100).optional(),
  variantBPersona: z.string().max(50_000),
  trafficRatio: z.number().int().min(1).max(99).optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(["draft", "running", "paused", "completed"]).optional(),
  variantAName: z.string().min(1).max(100).optional(),
  variantAPersona: z.string().max(50_000).optional(),
  variantBName: z.string().min(1).max(100).optional(),
  variantBPersona: z.string().max(50_000).optional(),
  trafficRatio: z.number().int().min(1).max(99).optional(),
});

export const experimentRoutes = new Hono()

  .get("/", (c) => {
    const items = listExperiments();
    return c.json({ items });
  })

  .get("/:id", (c) => {
    const id = c.req.param("id");
    const exp = getExperiment(id);
    if (!exp) return c.json({ error: "Thử nghiệm không tồn tại" }, 404);

    const metrics = getExperimentMetrics(id);
    return c.json({ experiment: exp, metrics });
  })

  .post("/", async (c) => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Dữ liệu không hợp lệ", issues: parsed.error.issues }, 400);
    }

    if (getExperiment(parsed.data.id)) {
      return c.json({ error: "ID thử nghiệm đã tồn tại" }, 409);
    }

    const agent = getAgent(parsed.data.agentId);
    if (!agent) {
      return c.json({ error: "Agent chỉ định không tồn tại" }, 404);
    }

    const exp = createExperiment(parsed.data);
    log.info({ experimentId: exp.id }, "Tạo thử nghiệm A/B thành công");
    return c.json({ experiment: exp }, 201);
  })

  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Dữ liệu không hợp lệ", issues: parsed.error.issues }, 400);
    }

    const updated = updateExperiment(id, parsed.data);
    if (!updated) return c.json({ error: "Thử nghiệm không tồn tại" }, 404);

    log.info({ experimentId: id, status: updated.status }, "Cập nhật thử nghiệm A/B");
    return c.json({ experiment: updated });
  })

  .delete("/:id", (c) => {
    const id = c.req.param("id");
    const result = deleteExperiment(id);
    if (!result.ok) {
      return c.json({ error: result.reason }, 400);
    }

    return c.json({ ok: true });
  });
