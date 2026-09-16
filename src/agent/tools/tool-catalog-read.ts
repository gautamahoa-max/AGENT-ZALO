import { createQueryNotebookLMTool } from "./query-notebooklm-tool.js";
import { isSidecarConfigured } from "../../config/runtime-vision-settings.js";
import { createGetDatetimeTool } from "./get-datetime-tool.js";
import { createGetGroupInfoTool } from "./get-group-info-tool.js";
import { createReadImageTool } from "./read-image-tool.js";
import type { ToolDefinition } from "./tool-catalog-types.js";
import { createWebFetchTool } from "./web-fetch-tool.js";
import { createWebSearchTool } from "./web-search-tool.js";
import { createEvaluateLoanEligibilityTool } from "./evaluate-loan-eligibility-tool.js";
import { createRecommendCreditCardTool } from "./recommend-credit-card-tool.js";
import { createCalculatePropertyFeesTool } from "./calculate-property-fees-tool.js";
import { queryKnowledgeGraphTool } from "./query-knowledge-graph-tool.js";
import { createSimulateDebtRefinanceTool } from "./simulate-debt-refinance-tool.js";

/**
 * Nhóm "read" của catalog tool - tra cứu, không tác động ra ngoài. Tách khỏi
 * `tool-catalog.ts` (đúng nếp tách theo NHÓM đã bàn ở phase 04) để không file
 * catalog nào vượt ngưỡng 200 dòng khi thêm tool mới.
 */
export const READ_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    key: "get_datetime",
    label: "Ngày giờ hiện tại",
    description: "Cho bot biết chính xác ngày, giờ, thứ trong tuần theo múi giờ Việt Nam",
    group: "read",
    // Không khoe: người dùng tự xem giờ được, đưa vào danh sách năng lực chỉ
    // làm cả danh sách trông nghiệp dư. Model vẫn gọi tool này bình thường.
    keTrongKhaNang: false,
    build: () => createGetDatetimeTool(),
  },
  {
    key: "web_search",
    label: "Tìm kiếm web",
    description: "Tìm thông tin mới trên web theo chuỗi nguồn, DuckDuckGo luôn đứng cuối",
    group: "read",
    hasSettings: true,
    build: () => createWebSearchTool(),
  },
  {
    key: "web_fetch",
    label: "Đọc trang web",
    description: "Đọc nội dung 1 URL công khai (đã chặn IP nội bộ chống SSRF)",
    group: "read",
    hasSettings: true,
    build: () => createWebFetchTool(),
  },
  {
    key: "read_image",
    label: "Nhìn kỹ ảnh",
    description:
      "Hỏi model đọc ảnh (sidecar) một câu cụ thể về ảnh đã nhận - đếm, đọc chữ nhỏ, soi chi tiết",
    group: "read",
    // Cấu hình đọc ảnh (chế độ vision + sidecar) nằm trong modal Settings của
    // chính dòng này - gom về một chỗ thay vì tách sang trang Providers
    hasSettings: true,
    available: () => isSidecarConfigured(),
    unavailableHint: "Bấm Settings để cấu hình model sidecar đọc ảnh",
    // Lượt theo lịch không có ảnh nào để mà nhìn kỹ lại
    runsInScheduledTurn: false,
    build: (ctx) => createReadImageTool(ctx),
  },
  {
    key: "get_group_info",
    label: "Thông tin nhóm",
    description: "Xem tên nhóm, số thành viên, danh sách thành viên của nhóm hiện tại",
    group: "read",
    build: (ctx) => createGetGroupInfoTool(ctx),
  },
  {
    key: "query_notebooklm",
    label: "Tra cứu NotebookLM",
    description: "Hỏi kho kiến thức NotebookLM",
    group: "read",
    build: () => createQueryNotebookLMTool(),
  },
  {
    key: "evaluate_loan_eligibility",
    label: "Thẩm định hạn mức vay & DTI",
    description: "Thẩm định điều kiện vay theo trần LTV tài sản và DTI < 80% thu nhập",
    group: "read",
    build: () => createEvaluateLoanEligibilityTool(),
  },
  {
    key: "recommend_credit_card",
    label: "Tư vấn thẻ tín dụng OCB",
    description: "Gợi ý dòng thẻ tín dụng OCB theo thói quen chi tiêu (online, ăn uống, làm đẹp, du lịch)",
    group: "read",
    build: () => createRecommendCreditCardTool(),
  },
  {
    key: "calculate_property_fees",
    label: "Tính thuế phí BĐS",
    description: "Tính nhanh thuế TNCN 2%, lệ phí trước bạ 0.5%, phí công chứng và sang tên BĐS",
    group: "read",
    build: () => createCalculatePropertyFeesTool(),
  },
  {
    key: "query_knowledge_graph",
    label: "Truy vấn Knowledge Graph",
    description: "Truy xuất sự thật tuyệt đối (dự án, lãi suất) bằng SQL (không ảo giác)",
    group: "read",
    build: () => queryKnowledgeGraphTool,
  },
  {
    key: "simulate_debt_refinance",
    label: "Mô phỏng Chuyển nợ / Đảo nợ",
    description: "Tính toán dòng tiền và điểm hòa vốn khi chuyển khoản vay từ ngân hàng khác sang OCB",
    group: "read",
    build: (ctx) => createSimulateDebtRefinanceTool(ctx),
  },
];

