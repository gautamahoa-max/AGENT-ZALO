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

describe("notify_vip_lead tool", () => {
  it("lưu lead vào file vip-leads.jsonl và trả kết quả thành công khi chưa có password", async () => {
    delete process.env.GMAIL_APP_PASSWORD;
    const tool = notifyToolModule.createNotifyVipLeadTool(ctx(message()));

    const res = await chay(tool, {
      customer_name: "Anh Hoàng",
      interest_type: "bds_palm_city",
      estimated_value: "5 tỷ VNĐ",
      details: "Khách có sẵn 2 tỷ tiền mặt, cần vay 3 tỷ trong 25 năm mua căn 3PN Palm City",
      action_needed: "Gọi điện tư vấn lãi suất ưu đãi và hẹn gặp tại chi nhánh Gia Định",
      urgency: "cao",
    });

    const text = ketQuaThanhCong(res);
    assert.match(text, /Đã ghi nhận/);
    assert.match(text, /Anh Hoàng/);

    // Kiểm tra file vip-leads.jsonl đã được ghi
    const leadFile = path.join(dataDir, "vip-leads.jsonl");
    assert.ok(fs.existsSync(leadFile), "File vip-leads.jsonl phải tồn tại");
    const content = fs.readFileSync(leadFile, "utf-8");
    assert.match(content, /Anh Hoàng/);
    assert.match(content, /bds_palm_city/);
  });
});
