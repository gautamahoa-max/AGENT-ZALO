import { Hono } from "hono";
import {
  approveKnowledgeProposal,
  loadSyncState,
  rejectKnowledgeSyncProposal,
  syncNotebookLM,
} from "../../services/notebooklm-sync-service.js";
import { listKnowledgeProposals } from "../../conversation/knowledge-sync-proposal-store.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger("sync-routes");

let isSyncRunning = false;

export const syncRoutes = new Hono()
  .get("/notebooklm/status", (c) => {
    const state = loadSyncState();
    const syncedCount = Object.keys(state.syncedSources).length;
    return c.json({
      lastSyncAt: state.lastSyncAt,
      syncedSourcesCount: syncedCount,
      history: state.history,
      isSyncRunning,
      proposals: listKnowledgeProposals(),
    });
  })
  .post("/notebooklm/run", async (c) => {
    if (isSyncRunning) {
      return c.json(
        { error: "Tiến trình đồng bộ đang chạy, vui lòng đợi hoàn tất." },
        409,
      );
    }

    const body = (await c.req.json().catch(() => ({}))) as { forceAll?: boolean };
    isSyncRunning = true;
    log.info({ forceAll: body.forceAll }, "Bắt đầu yêu cầu đồng bộ từ Dashboard...");

    try {
      const result = await syncNotebookLM({ forceAll: body.forceAll });
      return c.json(result);
    } catch (err: any) {
      log.error({ err }, "Đồng bộ thất bại");
      return c.json(
        {
          error: "Đồng bộ từ NotebookLM thất bại",
          details: err.message || String(err),
        },
        500,
      );
    } finally {
      isSyncRunning = false;
    }
  })
  .post("/notebooklm/proposals/:id/approve", (c) => {
    try {
      return c.json(approveKnowledgeProposal(c.req.param("id")));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 409);
    }
  })
  .post("/notebooklm/proposals/:id/reject", (c) => {
    try {
      return c.json(rejectKnowledgeSyncProposal(c.req.param("id")));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 409);
    }
  });
