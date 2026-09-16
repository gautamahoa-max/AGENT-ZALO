import { useEffect, useState } from "react";
import { api, type LeadItem, type RoiSummaryData } from "../dashboard-api-client";
import { PageHeader } from "../layout/page-header";
import { IconGrid } from "../shared/dashboard-icons";

export function RoiPage() {
  const [summary, setSummary] = useState<RoiSummaryData | null>(null);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([api.roi.summary(), api.roi.leads(statusFilter)])
      .then(([sumRes, leadRes]) => {
        setSummary(sumRes);
        setLeads(leadRes.items);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleUpdateStatus = async (id: number, newStatus: string) => {
    let actualRev: number | undefined = undefined;
    if (newStatus === "disbursed") {
      const input = prompt("Nhập doanh thu hoa hồng/NIM thực tế từ khoản giải ngân này (VNĐ):", "15000000");
      if (input !== null) {
        actualRev = parseInt(input.replace(/[^\d]/g, ""), 10) || 0;
      }
    }
    setUpdatingId(id);
    try {
      await api.roi.updateLead(id, {
        status: newStatus as any,
        actualRevenueVnd: actualRev,
      });
      loadData();
    } catch (err: any) {
      alert(err.message || "Cập nhật thất bại");
    } finally {
      setUpdatingId(null);
    }
  };

  const formatVnd = (num: number) => {
    if (num >= 1_000_000_000) {
      return `${(num / 1_000_000_000).toFixed(2)} tỷ VNĐ`;
    }
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(0)} tr VNĐ`;
    }
    return `${num.toLocaleString("vi-VN")} đ`;
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    qualified: { label: "Tiềm năng", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
    appointment_booked: { label: "Hẹn gặp Cafe", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
    submitted: { label: "Nộp hồ sơ", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
    approved: { label: "Đã phê duyệt", color: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300" },
    disbursed: { label: "Đã giải ngân", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
    lost: { label: "Hủy / Trượt", color: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={IconGrid}
        title="Hiệu quả Kinh doanh & ROI"
        subtitle="Theo dõi phễu khách hàng tín dụng OCB, quy đổi doanh thu và đo lường tỷ suất sinh lời AI-First"
      />

      {loading && !summary ? (
        <p className="text-sm text-ink-soft">Đang tổng hợp dữ liệu tài chính...</p>
      ) : summary ? (
        <>
          {/* 4 Thẻ KPI C-Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Doanh thu mang về
                </span>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  ROI: {summary.roiMultiplier}x
                </span>
              </div>
              <p className="mt-3 text-2xl font-black text-ink">
                {formatVnd(summary.actualRevenueVnd > 0 ? summary.actualRevenueVnd : summary.expectedRevenueVnd)}
              </p>
              <p className="mt-1 text-[11px] text-ink-soft">
                {summary.actualRevenueVnd > 0 ? "Đã thực thu giải ngân" : "Dự kiến (NIM & Phí hoa hồng)"}
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Quy mô phễu vay (Pipeline)
              </span>
              <p className="mt-3 text-2xl font-black text-ink">{formatVnd(summary.pipelineValueVnd)}</p>
              <p className="mt-1 text-[11px] text-ink-soft">Tổng nhu cầu vốn khách hàng quan tâm</p>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Khách hàng VIP (Leads)
              </span>
              <p className="mt-3 text-2xl font-black text-ink">{summary.totalLeads} Lead</p>
              <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                {summary.totalAppointments} Lịch hẹn gặp cà phê
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Chi phí AI / Lead (CPL)
              </span>
              <p className="mt-3 text-2xl font-black text-ink">
                {summary.costPerLeadVnd.toLocaleString("vi-VN")} đ
              </p>
              <p className="mt-1 text-[11px] text-ink-soft">
                Tổng phí LLM: {summary.totalLlmCostVnd.toLocaleString("vi-VN")} đ (${summary.totalLlmCostUsd})
              </p>
            </div>
          </div>

          {/* Biểu đồ Phễu chuyển đổi & Phân bổ sản phẩm */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Phễu chuyển đổi */}
            <div className="lg:col-span-2 rounded-2xl border border-line bg-surface p-5 space-y-4">
              <h3 className="text-sm font-bold text-ink uppercase tracking-wider">
                Phễu chuyển đổi khách hàng tín dụng
              </h3>
              <div className="space-y-3 pt-2">
                {summary.funnel.map((step) => {
                  const percent = summary.totalLeads > 0 ? (step.count / summary.totalLeads) * 100 : 0;
                  return (
                    <div key={step.status} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-ink">{step.label}</span>
                        <span className="text-ink-soft">
                          <strong className="text-ink">{step.count}</strong> ({percent.toFixed(0)}%) · {formatVnd(step.valueVnd)}
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-tile">
                        <div
                          className="h-full bg-zalo-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(percent, step.count > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Phân bổ sản phẩm */}
            <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
              <h3 className="text-sm font-bold text-ink uppercase tracking-wider">
                Phân bổ theo nhu cầu
              </h3>
              <div className="space-y-3 pt-2 max-h-72 overflow-y-auto pr-1">
                {summary.productBreakdown.length === 0 ? (
                  <p className="text-xs text-ink-soft">Chưa có dữ liệu sản phẩm</p>
                ) : (
                  summary.productBreakdown.map((p) => (
                    <div key={p.interestType} className="flex items-center justify-between text-xs border-b border-line pb-2">
                      <div>
                        <p className="font-semibold text-ink">{p.label}</p>
                        <p className="text-[11px] text-ink-soft">{p.count} khách hàng</p>
                      </div>
                      <span className="font-mono text-xs font-medium text-ink">
                        {formatVnd(p.volumeVnd)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Bảng Quản lý Lead VIP */}
          <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h3 className="text-sm font-bold text-ink uppercase tracking-wider">
                Danh sách Lead VIP gần đây ({leads.length})
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-soft">Lọc trạng thái:</span>
                <select
                  className="gc-input text-xs py-1 px-2.5"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="qualified">Khách tiềm năng</option>
                  <option value="appointment_booked">Đã hẹn Cafe</option>
                  <option value="submitted">Đã nộp hồ sơ</option>
                  <option value="approved">Đã phê duyệt</option>
                  <option value="disbursed">Đã giải ngân</option>
                  <option value="lost">Hủy / Thất bại</option>
                </select>
              </div>
            </div>

            {leads.length === 0 ? (
              <div className="py-8 text-center text-xs text-ink-soft">
                Không có lead nào ở trạng thái này. Lead sẽ tự động xuất hiện khi Agent phát hiện nhu cầu vay/thẻ của khách.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line text-[11px] font-semibold text-ink-soft uppercase">
                    <tr>
                      <th className="pb-2.5">Khách hàng</th>
                      <th className="pb-2.5">Nhu cầu</th>
                      <th className="pb-2.5">Giá trị ước tính</th>
                      <th className="pb-2.5">Trạng thái</th>
                      <th className="pb-2.5">Doanh thu</th>
                      <th className="pb-2.5">Ngày tạo</th>
                      <th className="pb-2.5 text-right">Chuyển trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {leads.map((l) => {
                      const st = statusLabels[l.status] || { label: l.status, color: "bg-tile text-ink" };
                      return (
                        <tr key={l.id} className="hover:bg-tile/50">
                          <td className="py-3 font-semibold text-ink">
                            {l.customerName}
                            {l.senderName && (
                              <span className="block text-[11px] font-normal text-ink-soft">
                                Zalo: {l.senderName}
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-ink">
                            {l.interestType}
                            {l.experimentVariant && (
                              <span className="ml-1.5 rounded bg-purple-100 dark:bg-purple-900/30 px-1 py-0.5 text-[10px] text-purple-700 dark:text-purple-300">
                                Variant {l.experimentVariant}
                              </span>
                            )}
                          </td>
                          <td className="py-3 font-mono text-ink">
                            {l.estimatedValue || formatVnd(l.loanAmountVnd)}
                          </td>
                          <td className="py-3">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.color}`}>
                              {st.label}
                            </span>
                          </td>
                          <td className="py-3 font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                            {l.actualRevenueVnd > 0 ? formatVnd(l.actualRevenueVnd) : `${formatVnd(l.expectedRevenueVnd)} (DK)`}
                          </td>
                          <td className="py-3 text-[11px] text-ink-soft">
                            {new Date(l.createdAt).toLocaleDateString("vi-VN")}
                          </td>
                          <td className="py-3 text-right">
                            <select
                              disabled={updatingId === l.id}
                              className="gc-input text-[11px] py-1 px-2"
                              value={l.status}
                              onChange={(e) => handleUpdateStatus(l.id, e.target.value)}
                            >
                              <option value="qualified">Tiềm năng</option>
                              <option value="appointment_booked">Hẹn gặp Cafe</option>
                              <option value="submitted">Nộp hồ sơ</option>
                              <option value="approved">Đã phê duyệt</option>
                              <option value="disbursed">Đã giải ngân</option>
                              <option value="lost">Hủy</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
