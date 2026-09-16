import { db } from "./database.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("lead-store");

export type LeadStatus =
  | "qualified"
  | "appointment_booked"
  | "submitted"
  | "approved"
  | "disbursed"
  | "lost";

export type Lead = {
  id: number;
  accountId: string;
  threadId: string;
  senderId: string | null;
  senderName: string | null;
  customerName: string;
  phone: string | null;
  interestType: string;
  estimatedValue: string;
  loanAmountVnd: number;
  expectedRevenueVnd: number;
  actualRevenueVnd: number;
  status: LeadStatus;
  experimentId: string | null;
  experimentVariant: string | null;
  urgency: string;
  details: string;
  actionNeeded: string;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: number;
  account_id: string;
  thread_id: string;
  sender_id: string | null;
  sender_name: string | null;
  customer_name: string;
  phone: string | null;
  interest_type: string;
  estimated_value: string;
  loan_amount_vnd: number;
  expected_revenue_vnd: number;
  actual_revenue_vnd: number;
  status: string;
  experiment_id: string | null;
  experiment_variant: string | null;
  urgency: string;
  details: string;
  action_needed: string;
  created_at: string;
  updated_at: string;
};

const toLead = (r: Row): Lead => ({
  id: r.id,
  accountId: r.account_id,
  threadId: r.thread_id,
  senderId: r.sender_id,
  senderName: r.sender_name,
  customerName: r.customer_name,
  phone: r.phone,
  interestType: r.interest_type,
  estimatedValue: r.estimated_value,
  loanAmountVnd: r.loan_amount_vnd,
  expectedRevenueVnd: r.expected_revenue_vnd,
  actualRevenueVnd: r.actual_revenue_vnd,
  status: r.status as LeadStatus,
  experimentId: r.experiment_id,
  experimentVariant: r.experiment_variant,
  urgency: r.urgency,
  details: r.details,
  actionNeeded: r.action_needed,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/**
 * Trích xuất giá trị số (VNĐ) từ chuỗi mô tả giá trị ước tính
 * Ví dụ: "Vay 3.5 tỷ" -> 3,500,000,000; "Căn 2PN 2.2 tỷ" -> 2,200,000,000; "Thẻ 300tr" -> 300,000,000
 */
export function parseVndAmount(text: string): number {
  if (!text) return 0;
  const clean = text.toLowerCase().replace(/,/g, ".");

  // Mẫu "X.X tỷ" hoặc "X tỷ"
  const tyMatch = clean.match(/([\d.]+)\s*tỷ/);
  if (tyMatch && tyMatch[1]) {
    const num = parseFloat(tyMatch[1]);
    if (!isNaN(num)) return Math.round(num * 1_000_000_000);
  }

  // Mẫu "X tr", "X triệu"
  const trMatch = clean.match(/([\d.]+)\s*(tr|triệu)/);
  if (trMatch && trMatch[1]) {
    const num = parseFloat(trMatch[1]);
    if (!isNaN(num)) return Math.round(num * 1_000_000);
  }

  // Mẫu số thuần túy > 100,000
  const numMatch = clean.replace(/[^\d]/g, "");
  if (numMatch) {
    const num = parseInt(numMatch, 10);
    if (!isNaN(num) && num >= 100_000) return num;
  }

  return 0;
}

/**
 * Ước tính doanh thu ngân hàng (NIM / Hoa hồng giải ngân) từ nhu cầu
 */
export function estimateExpectedRevenue(interestType: string, loanAmountVnd: number): number {
  if (interestType === "the_tin_dung") {
    return 500_000; // Ước tính hoa hồng phát hành thẻ tín dụng
  }

  if (loanAmountVnd > 0) {
    // 0.8% giá trị khoản vay tín dụng thế chấp / BĐS
    return Math.round(loanAmountVnd * 0.008);
  }

  // Mặc định cho gói vay chung chưa rõ số tiền
  return 15_000_000;
}

export function createLead(input: {
  accountId: string;
  threadId: string;
  senderId?: string | null;
  senderName?: string | null;
  customerName: string;
  phone?: string | null;
  interestType: string;
  estimatedValue?: string;
  details: string;
  actionNeeded: string;
  urgency?: string;
  experimentId?: string | null;
  experimentVariant?: string | null;
}): Lead {
  const estVal = input.estimatedValue || "";
  const loanAmount = parseVndAmount(estVal);
  const expectedRev = estimateExpectedRevenue(input.interestType, loanAmount);
  const status: LeadStatus =
    input.interestType === "hen_gap_cafe" ? "appointment_booked" : "qualified";

  const res = db
    .prepare(
      `INSERT INTO leads (
        account_id, thread_id, sender_id, sender_name, customer_name, phone,
        interest_type, estimated_value, loan_amount_vnd, expected_revenue_vnd, actual_revenue_vnd,
        status, experiment_id, experiment_variant, urgency, details, action_needed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.accountId,
      input.threadId,
      input.senderId ?? null,
      input.senderName ?? null,
      input.customerName,
      input.phone ?? null,
      input.interestType,
      estVal,
      loanAmount,
      expectedRev,
      status,
      input.experimentId ?? null,
      input.experimentVariant ?? null,
      input.urgency ?? "cao",
      input.details,
      input.actionNeeded,
    );

  log.info({ leadId: res.lastInsertRowid, customerName: input.customerName }, "Đã tạo hồ sơ Lead VIP");
  return getLead(Number(res.lastInsertRowid))!;
}

export function getLead(id: number): Lead | null {
  const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(id) as Row | undefined;
  return row ? toLead(row) : null;
}

export function listLeads(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): { items: Lead[]; total: number } {
  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;

  let query = "SELECT * FROM leads";
  let countQuery = "SELECT COUNT(*) as total FROM leads";
  const args: (string | number)[] = [];

  if (params?.status && params.status !== "all") {
    query += " WHERE status = ?";
    countQuery += " WHERE status = ?";
    args.push(params.status);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  const rows = db.prepare(query).all(...args, limit, offset) as Row[];
  const totalRow = db.prepare(countQuery).get(...args) as { total: number };

  return {
    items: rows.map(toLead),
    total: totalRow.total,
  };
}

export function updateLeadStatus(
  id: number,
  patch: {
    status?: LeadStatus;
    actualRevenueVnd?: number;
    details?: string;
  },
): Lead | null {
  const current = getLead(id);
  if (!current) return null;

  db.prepare(
    `UPDATE leads
     SET status = COALESCE(?, status),
         actual_revenue_vnd = COALESCE(?, actual_revenue_vnd),
         details = COALESCE(?, details),
         updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     WHERE id = ?`,
  ).run(patch.status ?? null, patch.actualRevenueVnd ?? null, patch.details ?? null, id);

  log.info({ leadId: id, patch }, "Đã cập nhật trạng thái Lead");
  return getLead(id);
}

export type RoiSummary = {
  totalLlmCostUsd: number;
  totalLlmCostVnd: number;
  totalLeads: number;
  totalAppointments: number;
  totalDisbursed: number;
  pipelineValueVnd: number;
  expectedRevenueVnd: number;
  actualRevenueVnd: number;
  costPerLeadVnd: number;
  roiMultiplier: number;
  funnel: { status: string; label: string; count: number; valueVnd: number }[];
  productBreakdown: { interestType: string; label: string; count: number; volumeVnd: number }[];
};

const USD_TO_VND_RATE = 25_500;
const COST_PER_MILLION_TOKENS = 0.4; // $0.4 / 1M token average

/**
 * Tổng hợp toàn diện báo cáo ROI & Hiệu quả kinh doanh
 */
export function getRoiSummary(): RoiSummary {
  // 1. Tính tổng chi phí LLM
  const turnRow = db
    .prepare("SELECT COALESCE(SUM(total_tokens), 0) as total_tokens FROM agent_turns")
    .get() as { total_tokens: number };
  const totalTokens = turnRow.total_tokens || 0;
  const totalLlmCostUsd = Number(((totalTokens / 1_000_000) * COST_PER_MILLION_TOKENS).toFixed(2));
  const totalLlmCostVnd = Math.round(totalLlmCostUsd * USD_TO_VND_RATE);

  // 2. Thống kê Lead & Doanh thu
  const statsRow = db
    .prepare(
      `SELECT
        COUNT(id) AS total_leads,
        SUM(CASE WHEN status = 'appointment_booked' OR interest_type = 'hen_gap_cafe' THEN 1 ELSE 0 END) AS total_appointments,
        SUM(CASE WHEN status = 'disbursed' THEN 1 ELSE 0 END) AS total_disbursed,
        COALESCE(SUM(loan_amount_vnd), 0) AS pipeline_value_vnd,
        COALESCE(SUM(expected_revenue_vnd), 0) AS expected_revenue_vnd,
        COALESCE(SUM(actual_revenue_vnd), 0) AS actual_revenue_vnd
       FROM leads`,
    )
    .get() as {
    total_leads: number;
    total_appointments: number;
    total_disbursed: number;
    pipeline_value_vnd: number;
    expected_revenue_vnd: number;
    actual_revenue_vnd: number;
  };

  const totalLeads = statsRow.total_leads || 0;
  const totalAppointments = statsRow.total_appointments || 0;
  const totalDisbursed = statsRow.total_disbursed || 0;
  const pipelineValueVnd = statsRow.pipeline_value_vnd || 0;
  const expectedRevenueVnd = statsRow.expected_revenue_vnd || 0;
  const actualRevenueVnd = statsRow.actual_revenue_vnd || 0;

  // Cost Per Lead (VND)
  const costPerLeadVnd = totalLeads > 0 ? Math.round(totalLlmCostVnd / totalLeads) : 0;

  // ROI Multiplier: (Doanh thu - Chi phí) / Chi phí
  // Nếu actualRevenueVnd = 0 thì so sánh với expectedRevenueVnd để thể hiện tiềm năng
  const effectiveRevenue = actualRevenueVnd > 0 ? actualRevenueVnd : expectedRevenueVnd;
  const roiMultiplier =
    totalLlmCostVnd > 0
      ? Number(((effectiveRevenue - totalLlmCostVnd) / totalLlmCostVnd).toFixed(1))
      : 0;

  // 3. Phễu chuyển đổi (Funnel)
  const funnelLabels: Record<string, string> = {
    qualified: "Khách tiềm năng",
    appointment_booked: "Đã hẹn gặp / Cafe",
    submitted: "Đã nộp hồ sơ",
    approved: "Đã phê duyệt",
    disbursed: "Đã giải ngân",
    lost: "Thất bại / Hủy",
  };

  const funnelRows = db
    .prepare(
      `SELECT status, COUNT(id) as count, COALESCE(SUM(loan_amount_vnd), 0) as value_vnd
       FROM leads
       GROUP BY status`,
    )
    .all() as { status: string; count: number; value_vnd: number }[];

  const funnel = Object.keys(funnelLabels).map((status) => {
    const found = funnelRows.find((r) => r.status === status);
    return {
      status,
      label: funnelLabels[status] ?? status,
      count: found?.count || 0,
      valueVnd: found?.value_vnd || 0,
    };
  });

  // 4. Phân bổ theo sản phẩm / Nhu cầu
  const productLabels: Record<string, string> = {
    vay_mua_nha: "Vay mua nhà",
    vay_the_chap: "Vay thế chấp",
    the_tin_dung: "Thẻ tín dụng",
    bds_the_prive: "Dự án The Privé",
    bds_palm_city: "Dự án Palm City",
    bds_bcons: "Dự án Bcons",
    bds_gladia: "Dự án Gladia",
    hen_gap_cafe: "Hẹn gặp Cafe",
    khac: "Nhu cầu khác",
  };

  const productRows = db
    .prepare(
      `SELECT interest_type, COUNT(id) as count, COALESCE(SUM(loan_amount_vnd), 0) as volume_vnd
       FROM leads
       GROUP BY interest_type
       ORDER BY count DESC`,
    )
    .all() as { interest_type: string; count: number; volume_vnd: number }[];

  const productBreakdown = productRows.map((r) => ({
    interestType: r.interest_type,
    label: productLabels[r.interest_type] || r.interest_type,
    count: r.count,
    volumeVnd: r.volume_vnd,
  }));

  return {
    totalLlmCostUsd,
    totalLlmCostVnd,
    totalLeads,
    totalAppointments,
    totalDisbursed,
    pipelineValueVnd,
    expectedRevenueVnd,
    actualRevenueVnd,
    costPerLeadVnd,
    roiMultiplier,
    funnel,
    productBreakdown,
  };
}
