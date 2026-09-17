import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { ThreadType, type API } from "zca-js";
import { cleanupTestEnv, setupTestEnv } from "../../shared/test-env-setup.js";
import type { AccountConfig } from "../../config/account-store.js";
import type { ParsedMessage } from "../../zalo/zalo-message-parser.js";
import { ketQuaThanhCong } from "./tool-failure-result-test-helper.js";

let dataDir: string;
let notifyToolModule: typeof import("./notify-vip-lead-tool.js");

before(async () => {
  dataDir = setupTestEnv();
  notifyToolModule = await import("./notify-vip-lead-tool.js");
});

after(() => {
  cleanupTestEnv(dataDir);
});

const api = {} as unknown as API;
const account = { id: "acc-test", label: "Hoà OCB" } as AccountConfig;
const message = (over: Partial<ParsedMessage> = {}): ParsedMessage =>
  ({
    accountId: account.id,
    threadId: "t-vip-123",
    threadType: ThreadType.User,
    isGroup: false,
    senderId: "u-vip-456",
    senderName: "Anh Hoàng",
    text: "Tôi muốn vay 5 tỷ mua căn Palm City",
    images: [],
    msgId: "m1",
    cliMsgId: "c1",
    isSelf: false,
    mentionsMe: false,
    rawData: {},
    ...over,
  }) as ParsedMessage;

const ctx = (msg: ParsedMessage) => ({ api, account, message: msg }) as any;
const chay = (tool: unknown, input: unknown): Promise<unknown> => (tool as any).execute(input, {});

describe("handoff_to_human tool", () => {
  it("dừng bot, tạo đúng một lead và không lặp side effect khi model gọi lại", async () => {
    delete process.env.GMAIL_APP_PASSWORD;
    const tool = notifyToolModule.createHandoffToHumanTool(ctx(message()));

    const input = {
      customer_confirmed: true,
      handoff_reason: "meeting_confirmed",
      customer_name: "Anh Hoàng",
      interest_type: "bds_palm_city",
      estimated_value: "5 tỷ VNĐ",
      details: "Khách có sẵn 2 tỷ tiền mặt, cần vay 3 tỷ trong 25 năm mua căn 3PN Palm City",
      action_needed: "Gọi điện tư vấn lãi suất ưu đãi và hẹn gặp tại chi nhánh Gia Định",
      meeting_area: "OCB Gia Định",
      meeting_time: "Sáng thứ Bảy",
      urgency: "cao",
    };
    const res = await chay(tool, input);

    const text = ketQuaThanhCong(res);
    assert.match(text, /HANDOFF_OK/);

    const threads = await import("../../conversation/thread-store.js");
    assert.equal(threads.isBotEnabled(account.id, message().threadId), false);
    assert.equal(threads.getConversationState(account.id, message().threadId)?.state, "human_owned");

    const leadFile = path.join(dataDir, "vip-leads.jsonl");
    assert.ok(fs.existsSync(leadFile), "File vip-leads.jsonl phải tồn tại");
    const content = fs.readFileSync(leadFile, "utf-8");
    assert.match(content, /Anh Hoàng/);
    assert.match(content, /bds_palm_city/);

    const second = ketQuaThanhCong(await chay(tool, input));
    assert.match(second, /HANDOFF_ALREADY_ACTIVE/);
    assert.equal(fs.readFileSync(leadFile, "utf-8"), content, "không được append lead lần hai");

    const { db } = await import("../../conversation/database.js");
    const row = db
      .prepare("SELECT COUNT(*) AS total FROM leads WHERE account_id = ? AND thread_id = ?")
      .get(account.id, message().threadId) as { total: number };
    assert.equal(row.total, 1, "handoff idempotent chỉ tạo một lead");
  });
});
