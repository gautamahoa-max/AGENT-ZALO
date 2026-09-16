import { tool } from "ai";
import { z } from "zod";
import type { ToolContext } from "./index.js";
import { ketQuaLoi } from "./tool-failure-result.js";

export function createAssignLabelTool({ api, message }: ToolContext) {
  return tool({
    description:
      "Tự động gắn nhãn phân loại (label) cho cuộc hội thoại hiện tại trên Zalo. Dùng khi đã xác định được chân dung khách hàng hoặc loại dịch vụ khách đang quan tâm.",
    inputSchema: z.object({
      labelName: z.string().describe("Tên nhãn muốn gắn (ví dụ: 'Khách hàng vay', 'Khách hàng TTD', 'Môi giới BCONS'...)"),
    }),
    execute: async ({ labelName }) => {
      try {
        const labelsResponse = await api.getLabels();
        const labelData = labelsResponse.labelData;
        
        const targetLabel = labelData.find((l: any) => l.text.toLowerCase() === labelName.toLowerCase());
        if (!targetLabel) {
          const availableLabels = labelData.map((l: any) => l.text).join(", ");
          return ketQuaLoi(`Không tìm thấy nhãn "${labelName}". Các nhãn hiện có: ${availableLabels}`);
        }
        
        if (!targetLabel.conversations.includes(message.threadId)) {
          targetLabel.conversations.push(message.threadId);
          await api.updateLabels({ labelData, version: labelsResponse.version });
          return `Đã gắn nhãn "${targetLabel.text}" cho cuộc hội thoại này thành công.`;
        } else {
          return `Cuộc hội thoại đã có sẵn nhãn "${targetLabel.text}" từ trước, không cần gắn lại.`;
        }
      } catch (err) {
        return ketQuaLoi(`Gắn nhãn thất bại: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });
}
