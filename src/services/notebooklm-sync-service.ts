import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { generateObject } from "ai";
import { z } from "zod";
import { dataDir } from "../config/env.js";
import { createLogger } from "../shared/logger.js";
import { resolveLanguageModel } from "../agent/llm-provider.js";
import { clearKBCache, readCorePersona } from "../agent/dynamic-kb-router.js";
import {
  claimKnowledgeProposal,
  getKnowledgeProposalBySource,
  markKnowledgeProposalApproved,
  rejectKnowledgeProposal,
  releaseKnowledgeProposal,
  saveKnowledgeProposal,
} from "../conversation/knowledge-sync-proposal-store.js";

const log = createLogger("notebooklm-sync");

const STATE_FILE_PATH = path.join(dataDir, "notebooklm-sync-state.json");
const GRAPH_DB_PATH = path.join(dataDir, "banking-graph.db");
const CORE_PERSONA_PATH = path.resolve(dataDir, "personas/core-persona.md");

const MCP_COMMAND =
  process.env.NOTEBOOKLM_MCP_COMMAND ||
  "notebooklm-mcp";

const MCP_CLI_PATH = process.env.NOTEBOOKLM_MCP_CLI_PATH;

function subprocessEnv(): Record<string, string> {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  if (MCP_CLI_PATH) clean.NOTEBOOKLM_MCP_CLI_PATH = MCP_CLI_PATH;
  return clean;
}

/**
 * Danh sách ID các sổ tay chính thức được liên kết với bot OCB:
 * 1. THẺ TÍN DỤNG OCB
 * 2. PALM RIVER
 * 3. BCONS
 * 4. GLADIA BY THE WATERS
 * 5. The Privé
 * 6. QUY ĐỊNH VAY VỐN OCB
 * 7. QUY ĐỊNH SP HUY ĐỘNG OCB
 */
export const LINKED_NOTEBOOK_IDS = (
  process.env.NOTEBOOK_IDS ||
  "47464149-ea6e-44c8-9a45-9d679343159d,6210de00-bedf-40b1-aabb-e14c279fceee,8e8bfed8-3052-43a4-abd2-796e82d43bdd,46028b98-6e7a-4750-a05b-14c03ecedf34,60a7e8f0-c8bb-40d6-bc58-dc2034fb660e,c3af3e9c-496e-4c3c-ae56-944f2dc7b615,d365139a-9a7e-4e3d-8add-008e69eb0c30"
)
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export interface SyncedSourceRecord {
  id: string;
  title: string;
  notebookId: string;
  notebookTitle: string;
  syncedAt: string;
  summary?: string;
}

export interface SyncState {
  lastSyncAt: string | null;
  syncedSources: Record<string, SyncedSourceRecord>;
  history: Array<{
    timestamp: string;
    newSourcesCount: number;
    sourceTitles: string[];
    summary: string;
  }>;
}

export function loadSyncState(): SyncState {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    log.warn({ err }, "Không đọc được file state sync, khởi tạo mới");
  }
  return {
    lastSyncAt: null,
    syncedSources: {},
    history: [],
  };
}

export function saveSyncState(state: SyncState): void {
  try {
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    log.error({ err }, "Lỗi khi lưu file sync state");
  }
}

async function createMcpClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: MCP_COMMAND,
    args: [],
    env: subprocessEnv(),
  });

  const client = new Client(
    { name: "zalo-agent-sync", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  return client;
}

export interface SyncResult {
  success: boolean;
  totalNotebooks: number;
  totalSources: number;
  newSourcesCount: number;
  processedSources: Array<{
    title: string;
    notebookTitle: string;
    summary: string;
    personaRulesCount: number;
    entitiesCount: number;
  }>;
  message: string;
}

/**
 * Trích xuất nội dung văn bản mới và cập nhật vào Persona + Fallback Knowledge Graph
 */
export async function syncNotebookLM(options: { forceAll?: boolean } = {}): Promise<SyncResult> {
  const state = loadSyncState();
  let client: Client | null = null;

  try {
    log.info("Bắt đầu quy trình kiểm tra & đồng bộ từ NotebookLM...");
    client = await createMcpClient();

    // 1. Quét danh sách sổ tay Notebook
    const listRes = (await client.callTool({
      name: "notebook_list",
      arguments: {},
    })) as any;

    const notebooks: any[] = listRes.structuredContent?.notebooks || [];
    // Chỉ lọc các sổ tay chính thức được liên kết trong cấu hình bot OCB
    const targetNotebooks = notebooks.filter((nb) => LINKED_NOTEBOOK_IDS.includes(nb.id));

    log.info(
      { totalLinked: targetNotebooks.length, notebookIds: LINKED_NOTEBOOK_IDS },
      "Đã lấy danh sách sổ tay NotebookLM được liên kết",
    );

    // 2. Thu thập danh sách tất cả sources từ các sổ tay liên kết
    const allFoundSources: Array<{
      id: string;
      title: string;
      notebookId: string;
      notebookTitle: string;
    }> = [];

    for (const nb of targetNotebooks) {
      try {
        const getRes = (await client.callTool({
          name: "notebook_get",
          arguments: { notebook_id: nb.id },
        })) as any;

        const sources: any[] = getRes.structuredContent?.sources || [];
        for (const s of sources) {
          allFoundSources.push({
            id: s.id,
            title: s.title,
            notebookId: nb.id,
            notebookTitle: nb.title,
          });
        }
      } catch (err) {
        log.warn({ notebookId: nb.id, err }, "Lỗi khi lấy chi tiết sổ tay");
      }
    }

    // Nếu chưa từng sync lần nào (lần đầu boot):
    // Đánh dấu toàn bộ nguồn hiện tại là đã biết để tránh việc tự phân tích lại 100+ file cũ
    const isFirstTime = !state.lastSyncAt && Object.keys(state.syncedSources).length === 0;
    if (isFirstTime && !options.forceAll) {
      for (const s of allFoundSources) {
        state.syncedSources[s.id] = {
          id: s.id,
          title: s.title,
          notebookId: s.notebookId,
          notebookTitle: s.notebookTitle,
          syncedAt: new Date().toISOString(),
          summary: "Tài liệu cơ sở ban đầu",
        };
      }
      state.lastSyncAt = new Date().toISOString();
      state.history.push({
        timestamp: state.lastSyncAt,
        newSourcesCount: allFoundSources.length,
        sourceTitles: allFoundSources.map((s) => s.title),
        summary: `Khởi tạo đồng bộ cơ sở ban đầu với ${allFoundSources.length} tài liệu từ ${targetNotebooks.length} sổ tay OCB.`,
      });
      saveSyncState(state);

      return {
        success: true,
        totalNotebooks: targetNotebooks.length,
        totalSources: allFoundSources.length,
        newSourcesCount: 0,
        processedSources: [],
        message: `Đã kết nối và lập chỉ mục ${allFoundSources.length} tài liệu từ ${targetNotebooks.length} sổ tay NotebookLM liên kết. Hệ thống sẵn sàng tự động đồng bộ khi có file mới!`,
      };
    }

    // 3. Tìm các nguồn mới chưa được đồng bộ
    const newSources = allFoundSources.filter((s) =>
      options.forceAll || (!state.syncedSources[s.id] && !getKnowledgeProposalBySource(s.id)),
    );

    if (newSources.length === 0) {
      state.lastSyncAt = new Date().toISOString();
      saveSyncState(state);
      return {
        success: true,
        totalNotebooks: targetNotebooks.length,
        totalSources: allFoundSources.length,
        newSourcesCount: 0,
        processedSources: [],
        message: `Không có tài liệu mới cần phân tích. Tài liệu đã duyệt hoặc đã có đề xuất trên dashboard.`,
      };
    }

    log.info({ count: newSources.length }, "Phát hiện tài liệu mới cần xử lý");

    // 4. Bóc tách từng tài liệu mới bằng AI
    const processedSources: SyncResult["processedSources"] = [];
    const model = resolveLanguageModel();
    for (const src of newSources) {
      log.info({ title: src.title, notebook: src.notebookTitle }, "Đang đọc nội dung file mới...");
      try {
        const contentRes = (await client.callTool({
          name: "source_get_content",
          arguments: { source_id: src.id },
        })) as any;

        const textOutput = contentRes.content?.[0]?.text || "";
        let docContent = "";
        try {
          const parsedJson = JSON.parse(textOutput);
          docContent = parsedJson.content || textOutput;
        } catch {
          docContent = textOutput;
        }

        if (!docContent.trim()) {
          log.warn({ id: src.id, title: src.title }, "File rỗng hoặc không trích xuất được text");
          continue;
        }

        // Cắt bớt nếu quá dài (chừa 50.000 ký tự đầu tiên)
        const truncatedDoc = docContent.slice(0, 50_000);

        // Gọi AI tinh lọc tài liệu
        const aiResult = await generateObject({
          model,
          schema: z.object({
            change_summary: z.string().describe("1 câu tóm tắt nội dung chính của văn bản này"),
            persona_rules: z
              .array(z.string())
              .describe("Các quy tắc cứng, trần LTV, điều kiện ân hạn, đối tượng, danh mục hồ sơ cần thêm vào Persona bot (tối đa 3-5 gạch đầu dòng ngắn gọn)"),
            fallback_entities: z
              .array(
                z.object({
                  id: z.string().describe("ID định danh duy nhất (vd: reg_tb432_2026, prj_new, sp_tietkiem_2026, cctg_2026...)"),
                  type: z.string().describe("Loại thực thể: REGULATION, PROJECT, POLICY, CARD, SAVING, DEPOSIT, CERTIFICATE_OF_DEPOSIT"),
                  name: z.string().describe("Tên hiển thị của thực thể"),
                  attributes: z.record(z.string(), z.string()).describe("Các cặp thuộc tính: giá trị (vd: lai_suat, an_han_goc, ltv, ky_han, phuong_thuc_tra_lai, han_muc...)"),
                }),
              )
              .describe("Các thực thể và thuộc tính để cập nhật vào Knowledge Graph Fallback (SQLite)"),
          }),
          system: `Bạn là Chuyên gia Ngân hàng OCB (Tín dụng, Cho vay, Tiền gửi tiết kiệm, Huy động vốn, Thẻ tín dụng).
Nhiệm vụ: Phân tích văn bản quy định/chính sách mới được cập nhật từ NotebookLM và chắt lọc thành 2 phần:
1. persona_rules: Các nguyên tắc an toàn, điều kiện tín dụng/tiết kiệm/huy động, hồ sơ cần bot tuân thủ nghiêm ngặt (ngắn gọn, xúc tích, không viết dài dòng).
2. fallback_entities: Bảng thực thể và thuộc tính để nạp vào cơ sở dữ liệu Fallback cục bộ (SQLite) phục vụ trả lời khi mất mạng.`,
          prompt: `Văn bản: "${src.title}" (thuộc sổ tay: "${src.notebookTitle}")\n\nNội dung văn bản:\n${truncatedDoc}`,
        });

        const distilled = aiResult.object;

        // AI chỉ tạo ĐỀ XUẤT. Không được tự sửa graph/persona; chủ tài khoản
        // phải xem và duyệt trên dashboard trước.
        saveKnowledgeProposal({
          sourceId: src.id,
          sourceTitle: src.title,
          notebookId: src.notebookId,
          notebookTitle: src.notebookTitle,
          changeSummary: distilled.change_summary,
          personaRules: distilled.persona_rules,
          entities: distilled.fallback_entities,
        }, options.forceAll === true);

        processedSources.push({
          title: src.title,
          notebookTitle: src.notebookTitle,
          summary: distilled.change_summary,
          personaRulesCount: distilled.persona_rules.length,
          entitiesCount: distilled.fallback_entities.length,
        });
      } catch (srcErr) {
        log.error({ src, err: srcErr }, "Lỗi khi xử lý tài liệu mới");
      }
    }

    state.lastSyncAt = new Date().toISOString();
    state.history.unshift({
      timestamp: state.lastSyncAt,
      newSourcesCount: processedSources.length,
      sourceTitles: processedSources.map((s) => s.title),
      summary: `Đã tạo ${processedSources.length} đề xuất chờ duyệt: ` + processedSources.map((s) => `${s.title}: ${s.summary}`).join("; "),
    });

    // Giữ lịch sử 30 lần gần nhất
    if (state.history.length > 30) {
      state.history = state.history.slice(0, 30);
    }

    saveSyncState(state);

    return {
      success: true,
      totalNotebooks: targetNotebooks.length,
      totalSources: allFoundSources.length,
      newSourcesCount: processedSources.length,
      processedSources,
      message: `Đã phân tích ${processedSources.length} tài liệu và tạo đề xuất chờ duyệt. Chưa có thay đổi nào được áp dụng vào bot.`,
    };
  } catch (err: any) {
    log.error({ err }, "Lỗi trong quá trình đồng bộ NotebookLM");
    throw err;
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        /* ignore */
      }
    }
  }
}

function ensureGraphSchema(graphDb: DatabaseSync): void {
  graphDb.exec(`
    CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attributes (entity_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS relations (source_id TEXT NOT NULL, target_id TEXT NOT NULL, relation_type TEXT NOT NULL);
  `);
}

/** Áp dụng một đề xuất đã được người thật duyệt; gọi lặp không nhân đôi rule. */
export function approveKnowledgeProposal(id: string): { ok: true } {
  const proposal = claimKnowledgeProposal(id);
  if (!proposal) throw new Error("Đề xuất không còn ở trạng thái chờ duyệt");
  try {
    fs.mkdirSync(path.dirname(GRAPH_DB_PATH), { recursive: true });
    const graphDb = new DatabaseSync(GRAPH_DB_PATH);
    try {
      ensureGraphSchema(graphDb);
      const upsert = graphDb.prepare("INSERT INTO entities (id,type,name) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,name=excluded.name");
      const del = graphDb.prepare("DELETE FROM attributes WHERE entity_id=? AND key=?");
      const ins = graphDb.prepare("INSERT INTO attributes (entity_id,key,value) VALUES (?,?,?)");
      graphDb.exec("BEGIN IMMEDIATE");
      try {
        for (const entity of proposal.entities) {
          upsert.run(entity.id, entity.type, entity.name);
          for (const [key, value] of Object.entries(entity.attributes)) {
            del.run(entity.id, key);
            ins.run(entity.id, key, String(value));
          }
        }
        graphDb.exec("COMMIT");
      } catch (error) {
        graphDb.exec("ROLLBACK");
        throw error;
      }
    } finally {
      graphDb.close();
    }

    if (proposal.personaRules.length > 0) {
      const marker = `notebooklm-proposal:${proposal.id}`;
      let persona = fs.existsSync(CORE_PERSONA_PATH)
        ? fs.readFileSync(CORE_PERSONA_PATH, "utf-8")
        : readCorePersona();
      const open = `<!-- ${marker} -->`;
      const close = `<!-- /${marker} -->`;
      const block = `${open}\n## Cập nhật đã duyệt: ${proposal.sourceTitle}\n${proposal.personaRules.map((rule) => `- ${rule}`).join("\n")}\n${close}`;
      const start = persona.indexOf(open);
      const end = persona.indexOf(close, start + open.length);
      const nextPersona = start >= 0 && end >= start
        ? persona.slice(0, start) + block + persona.slice(end + close.length)
        : `${persona.trimEnd()}\n\n${block}\n`;
      if (nextPersona !== persona) {
        persona = nextPersona;
        fs.mkdirSync(path.dirname(CORE_PERSONA_PATH), { recursive: true });
        fs.writeFileSync(CORE_PERSONA_PATH, persona, "utf-8");
        clearKBCache();
      }
    }

    const state = loadSyncState();
    state.syncedSources[proposal.sourceId] = {
      id: proposal.sourceId,
      title: proposal.sourceTitle,
      notebookId: proposal.notebookId,
      notebookTitle: proposal.notebookTitle,
      syncedAt: new Date().toISOString(),
      summary: proposal.changeSummary,
    };
    saveSyncState(state);
    markKnowledgeProposalApproved(id);
    log.info({ proposalId: id, sourceId: proposal.sourceId }, "Đã duyệt và áp dụng thay đổi Knowledge Base");
    return { ok: true };
  } catch (error) {
    releaseKnowledgeProposal(id, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export function rejectKnowledgeSyncProposal(id: string): { ok: true } {
  if (!rejectKnowledgeProposal(id)) throw new Error("Đề xuất không còn ở trạng thái chờ duyệt");
  return { ok: true };
}
