import { processBatch } from "../src/zalo/message-turn-processor.js";
import { getAccount } from "../src/config/account-store.js";
import type { ParsedMessage } from "../src/zalo/zalo-message-parser.js";
import { ThreadType, type API } from "zca-js";

async function run() {
  const account = getAccount("acc-cham-soc-bank");
  if (!account) throw new Error("No account");

  const threadId = "mock-thread-" + Date.now();
  const fakeMsg: ParsedMessage = {
    accountId: account.id,
    msgId: "msg-test-" + Date.now(),
    cliMsgId: "msg-test-" + Date.now(),
    threadId,
    threadType: ThreadType.User,
    senderId: "test-user-1",
    senderName: "Khách VIP",
    isGroup: false,
    isSelf: false,
    mentionsMe: false,
    images: [],
    text: "Lãi suất 10.5% cao quá em ơi! Hôm bữa anh hỏi bên ngân hàng VCB có 6.5% à, em có bớt lãi suất cho anh để xuống 7% không? Anh chốt vay 3 tỷ liền. Đừng dài dòng, trả lời có hay không.",
    rawData: { msgId: "raw-msg-1", cliMsgId: "raw-cli-msg-1" }
  };

  const fakeApi = {
    sendMessage: async (target: string, msg: any, type: number) => {
      console.log(`\n\n[MOCK SEND MESSAGE TO ${target}]`);
      console.log(msg.msg || msg);
      return { err: 0 };
    },
    sendSeen: async () => {},
    sendTyping: async () => {},
    addReaction: async () => {},
    resolveUrl: async () => "http://mock",
  } as unknown as API;

  console.log("SENDING MESSAGE:", fakeMsg.text);
  
  await processBatch(account, fakeApi, [fakeMsg]);
  console.log("\n\nDONE!");
}
run();
