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
let exportToolModule: typeof import("./export-mortgage-plan-tool.js");

before(async () => {
  dataDir = setupTestEnv();
  // copy all 4 templates to test dataDir/templates
  fs.mkdirSync(path.join(dataDir, "templates"), { recursive: true });
  fs.copyFileSync(
    path.resolve("data/templates/Bang_Tinh_Lai_The_Prive.xlsx"),
    path.join(dataDir, "templates", "Bang_Tinh_Lai_The_Prive.xlsx"),
  );
  fs.copyFileSync(
    path.resolve("data/templates/Bang_Tinh_Lai_Palm_River.xlsx"),
    path.join(dataDir, "templates", "Bang_Tinh_Lai_Palm_River.xlsx"),
  );
  fs.copyFileSync(
    path.resolve("data/templates/Bang_Tinh_Lai_Gladia.xlsx"),
    path.join(dataDir, "templates", "Bang_Tinh_Lai_Gladia.xlsx"),
  );
  fs.copyFileSync(
    path.resolve("data/templates/Bang_Tinh_Lai_Bcons.xlsx"),
    path.join(dataDir, "templates", "Bang_Tinh_Lai_Bcons.xlsx"),
  );
  exportToolModule = await import("./export-mortgage-plan-tool.js");
});

after(() => {
  cleanupTestEnv(dataDir);
});

let daGuiFiles: string[] = [];
const api = {
  sendMessage: async (payload: { attachments?: string[]; msg?: string }) => {
    if (payload.attachments) {
      daGuiFiles.push(...payload.attachments);
    }
    return { msgId: "m1" };
  },
} as unknown as API;

const account = { id: "acc-test", label: "Hoà OCB" } as AccountConfig;
const message = (over: Partial<ParsedMessage> = {}): ParsedMessage =>
  ({
    accountId: account.id,
    threadId: "t-calc-123",
    threadType: ThreadType.User,
    isGroup: false,
    senderId: "u-calc-456",
    senderName: "Anh Tuấn",
    text: "Tính giúp anh bảng lãi vay",
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

describe("export_mortgage_plan tool - 4 dự án chuẩn", () => {
  it("1. Bcons", async () => {
    daGuiFiles = [];
    const tool = exportToolModule.createExportMortgagePlanTool(ctx(message()));

    const res = await chay(tool, {
      project: "bcons",
      loan_amount: 2000000000,
      apartment_price: 2800000000,
      loan_term_months: 240,
      customer_name: "Anh Tuấn",
    });

    const text = ketQuaThanhCong(res);
    assert.match(text, /ĐÃ TẠO FILE EXCEL VÀ GỬI EMAIL/);
  });

  it("2. Gladia by the Waters", async () => {
    daGuiFiles = [];
    const tool = exportToolModule.createExportMortgagePlanTool(ctx(message()));

    const res = await chay(tool, {
      project: "gladia",
      loan_amount: 3500000000,
      apartment_price: 5000000000,
      loan_term_months: 240,
      customer_name: "Chị Mai",
    });

    const text = ketQuaThanhCong(res);
    assert.match(text, /ĐÃ TẠO FILE EXCEL VÀ GỬI EMAIL/);
  });

  it("3. Palm River / Palm City", async () => {
    daGuiFiles = [];
    const tool = exportToolModule.createExportMortgagePlanTool(ctx(message()));

    const res = await chay(tool, {
      project: "palm_river",
      loan_amount: 4000000000,
      apartment_price: 6000000000,
      loan_term_months: 240,
      customer_name: "Anh Hùng",
    });

    const text = ketQuaThanhCong(res);
    assert.match(text, /ĐÃ TẠO FILE EXCEL VÀ GỬI EMAIL/);
  });

  it("4. The Privé", async () => {
    daGuiFiles = [];
    const tool = exportToolModule.createExportMortgagePlanTool(ctx(message()));

    const res = await chay(tool, {
      project: "the_prive",
      loan_amount: 3500000000,
      apartment_price: 5000000000,
      loan_term_months: 240,
      customer_name: "Chị Lan",
    });

    const text = ketQuaThanhCong(res);
    assert.match(text, /ĐÃ TẠO FILE EXCEL VÀ GỬI EMAIL/);
  });
});
