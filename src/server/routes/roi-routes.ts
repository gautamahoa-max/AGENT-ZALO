import { Hono } from "hono";
import { z } from "zod";
import {
  getLead,
  getRoiSummary,
  listLeads,
  updateLeadStatus,
} from "../../conversation/lead-store.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger("roi-routes");

const patchLeadSchema = z.object({
  status: z
    .enum(["qualified", "appointment_booked", "submitted", "approved", "disbursed", "lost"])
    .optional(),
  actualRevenueVnd: z.number().min(0).optional(),
  details: z.string().max(2000).optional(),
});

export const roiRoutes = new Hono()

  .get("/roi", (c) => {
    const summary = getRoiSummary();
    return c.json(summary);
  })

  .get("/leads", (c) => {
    const status = c.req.query("status");
    const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!, 10) : 50;
    const offset = c.req.query("offset") ? parseInt(c.req.query("offset")!, 10) : 0;

    const res = listLeads({ status, limit, offset });
    return c.json(res);
  })

  .get("/leads/:id", (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ error: "ID không hợp lệ" }, 400);

    const lead = getLead(id);
    if (!lead) return c.json({ error: "Không tìm thấy Lead" }, 404);

    return c.json({ lead });
  })

  .patch("/leads/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ error: "ID không hợp lệ" }, 400);

    const parsed = patchLeadSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Dữ liệu không hợp lệ", issues: parsed.error.issues }, 400);
    }

    const updated = updateLeadStatus(id, parsed.data);
    if (!updated) return c.json({ error: "Không tìm thấy Lead" }, 404);

    log.info({ leadId: id, status: updated.status, actualRevenue: updated.actualRevenueVnd }, "Cập nhật Lead thành công");
    return c.json({ lead: updated });
  });
