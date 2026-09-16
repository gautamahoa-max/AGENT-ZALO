import { useEffect, useState } from "react";
import {
  api,
  type ExperimentItem,
  type ExperimentMetricsData,
  type ManagedAgent,
} from "../dashboard-api-client";
import { PageHeader } from "../layout/page-header";
import { IconBolt, IconClose } from "../shared/dashboard-icons";

export function ExperimentsPage() {
  const [experiments, setExperiments] = useState<ExperimentItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [metricsData, setMetricsData] = useState<ExperimentMetricsData | null>(null);
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Form tạo mới
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [formVarAName, setFormVarAName] = useState("Variant A (Gốc)");
  const [formVarAPersona, setFormVarAPersona] = useState("");
  const [formVarBName, setFormVarBName] = useState("Variant B (Mới)");
  const [formVarBPersona, setFormVarBPersona] = useState("");
  const [formRatio, setFormRatio] = useState(50);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const loadList = () => {
    setLoading(true);
    Promise.all([api.experiments.list(), api.agentsAdmin.list()])
      .then(([expRes, agentRes]) => {
        setExperiments(expRes.items);
        setAgents(agentRes.items);
        if (expRes.items.length > 0 && !selectedId) {
          setSelectedId(expRes.items[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMetricsData(null);
      return;
    }
    api.experiments
      .get(selectedId)
      .then((res) => setMetricsData(res.metrics))
      .catch(console.error);
  }, [selectedId]);

  const handleCreate = async () => {
    if (!formId || !formName || !formAgentId || !formVarAPersona || !formVarBPersona) {
      setFormError("Vui lòng điền đầy đủ các trường bắt buộc.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await api.experiments.create({
        id: formId,
        name: formName,
        description: formDesc,
        agentId: formAgentId,
        variantAName: formVarAName,
        variantAPersona: formVarAPersona,
        variantBName: formVarBName,
        variantBPersona: formVarBPersona,
        trafficRatio: formRatio,
      });
      setModalOpen(false);
      resetForm();
      loadList();
      setSelectedId(formId);
    } catch (err: any) {
      setFormError(err.message || "Tạo thử nghiệm thất bại");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormId("");
    setFormName("");
    setFormDesc("");
    setFormAgentId(agents[0]?.id || "");
    setFormVarAName("Variant A (Gốc)");
    setFormVarAPersona("");
    setFormVarBName("Variant B (Mới)");
    setFormVarBPersona("");
    setFormRatio(50);
    setFormError("");
  };

  const openCreateModal = () => {
    resetForm();
    if (agents.length > 0) {
      const defaultAgent = agents.find((a) => a.isDefault) || agents[0];
      setFormAgentId(defaultAgent.id);
      setFormVarAPersona(defaultAgent.persona || "");
    }
    setFormId(`exp-${Date.now().toString().slice(-4)}`);
    setModalOpen(true);
  };

  const updateStatus = async (id: string, status: ExperimentItem["status"]) => {
    try {
      await api.experiments.update(id, { status });
      loadList();
      if (selectedId === id) {
        api.experiments.get(id).then((res) => setMetricsData(res.metrics));
      }
    } catch (err: any) {
      alert(err.message || "Cập nhật trạng thái thất bại");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa thử nghiệm này không?")) return;
    try {
      await api.experiments.remove(id);
      setSelectedId(null);
      loadList();
    } catch (err: any) {
      alert(err.message || "Xóa thử nghiệm thất bại");
    }
  };

  const selectedExp = experiments.find((e) => e.id === selectedId);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={IconBolt}
        title="A/B Testing Persona"
        subtitle="Thử nghiệm đa biến kịch bản tư vấn, tự động chia traffic và đo lường tỷ lệ chuyển đổi Lead VIP"
        aside={
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-lg bg-zalo-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-zalo-600 shadow-sm"
          >
            + Tạo thử nghiệm mới
          </button>
        }
      />

      {loading ? (
        <p className="text-sm text-ink-soft">Đang tải danh sách thử nghiệm...</p>
      ) : experiments.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-tile text-ink-soft mb-4">
            <IconBolt size={28} />
          </div>
          <h3 className="text-base font-semibold text-ink">Chưa có thử nghiệm A/B nào</h3>
          <p className="mt-1 text-sm text-ink-soft max-w-md mx-auto">
            Tạo thử nghiệm đầu tiên để so sánh 2 kịch bản persona khác nhau và tìm ra kịch bản mang lại nhiều khách hàng vay vốn nhất.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-5 rounded-lg bg-zalo-500 px-4 py-2 text-sm font-medium text-white hover:bg-zalo-600"
          >
            Bắt đầu thử nghiệm ngay
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Cột trái: Danh sách Experiment */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft px-1">
              Danh sách thử nghiệm ({experiments.length})
            </h3>
            {experiments.map((exp) => {
              const isSelected = exp.id === selectedId;
              const statusColors = {
                running: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
                draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                paused: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
                completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
              };
              const statusLabels = {
                running: "Đang chạy",
                draft: "Bản nháp",
                paused: "Tạm dừng",
                completed: "Đã hoàn thành",
              };

              return (
                <div
                  key={exp.id}
                  onClick={() => setSelectedId(exp.id)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${
                    isSelected
                      ? "border-zalo-500 bg-surface shadow-md"
                      : "border-line bg-surface/70 hover:bg-surface hover:border-line-strong"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColors[exp.status]}`}>
                      {statusLabels[exp.status]}
                    </span>
                    <span className="text-[11px] text-ink-soft">
                      {new Date(exp.createdAt).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                  <h4 className="mt-2 font-semibold text-sm text-ink line-clamp-1">{exp.name}</h4>
                  <p className="mt-1 text-xs text-ink-soft line-clamp-2">
                    {exp.description || `Thử nghiệm persona cho agent ${exp.agentId}`}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Cột phải: Chi tiết & So sánh Variant A vs Variant B */}
          <div className="lg:col-span-3 space-y-6">
            {selectedExp && metricsData && (
              <>
                {/* Thanh điều khiển */}
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4">
                  <div>
                    <h2 className="text-base font-bold text-ink">{selectedExp.name}</h2>
                    <p className="text-xs text-ink-soft">
                      Agent mục tiêu: <span className="font-semibold text-ink">{selectedExp.agentId}</span> · Phân bổ traffic: {100 - selectedExp.trafficRatio}% (A) / {selectedExp.trafficRatio}% (B)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedExp.status === "draft" && (
                      <button
                        type="button"
                        onClick={() => updateStatus(selectedExp.id, "running")}
                        className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        Kích hoạt chạy
                      </button>
                    )}
                    {selectedExp.status === "running" && (
                      <button
                        type="button"
                        onClick={() => updateStatus(selectedExp.id, "paused")}
                        className="rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                      >
                        Tạm dừng
                      </button>
                    )}
                    {selectedExp.status === "paused" && (
                      <button
                        type="button"
                        onClick={() => updateStatus(selectedExp.id, "running")}
                        className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        Tiếp tục chạy
                      </button>
                    )}
                    {selectedExp.status !== "completed" && (
                      <button
                        type="button"
                        onClick={() => updateStatus(selectedExp.id, "completed")}
                        className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-tile"
                      >
                        Kết thúc thử nghiệm
                      </button>
                    )}
                    {selectedExp.status !== "running" && (
                      <button
                        type="button"
                        onClick={() => handleDelete(selectedExp.id)}
                        className="rounded-lg border border-red-200 dark:border-red-900/50 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        Xóa
                      </button>
                    )}
                  </div>
                </div>

                {/* Thẻ so sánh Variant A vs Variant B */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Variant A */}
                  <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-line pb-3">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zalo-600 dark:text-zalo-400">
                          Phiên bản đối chứng (Control)
                        </span>
                        <h3 className="text-base font-bold text-ink">{selectedExp.variantAName}</h3>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black text-ink">{metricsData.variantA.conversionRate}%</span>
                        <p className="text-[10px] text-ink-soft">Tỷ lệ chuyển đổi</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="rounded-xl bg-tile p-3">
                        <span className="text-lg font-bold text-ink">{metricsData.variantA.threads}</span>
                        <p className="text-[11px] text-ink-soft">Khách hàng (Threads)</p>
                      </div>
                      <div className="rounded-xl bg-tile p-3">
                        <span className="text-lg font-bold text-ink">{metricsData.variantA.turns}</span>
                        <p className="text-[11px] text-ink-soft">Lượt phản hồi</p>
                      </div>
                      <div className="rounded-xl bg-tile p-3">
                        <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                          {metricsData.variantA.leads}
                        </span>
                        <p className="text-[11px] text-ink-soft">Lead VIP thu được</p>
                      </div>
                      <div className="rounded-xl bg-tile p-3">
                        <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                          {metricsData.variantA.appointments}
                        </span>
                        <p className="text-[11px] text-ink-soft">Lịch hẹn Cafe</p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-ink">Persona đối chứng:</span>
                      <div className="max-h-36 overflow-y-auto rounded-lg border border-line bg-canvas p-2.5 font-mono text-[11px] leading-relaxed text-ink-soft whitespace-pre-wrap">
                        {selectedExp.variantAPersona}
                      </div>
                    </div>
                  </div>

                  {/* Variant B */}
                  <div className={`rounded-2xl border p-5 space-y-4 bg-surface ${
                    metricsData.variantB.conversionRate > metricsData.variantA.conversionRate && metricsData.variantB.leads > 0
                      ? "border-emerald-500 ring-2 ring-emerald-500/20"
                      : "border-line"
                  }`}>
                    <div className="flex items-center justify-between border-b border-line pb-3">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                          Phiên bản thử nghiệm (Challenger)
                        </span>
                        <h3 className="text-base font-bold text-ink">{selectedExp.variantBName}</h3>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black text-ink">{metricsData.variantB.conversionRate}%</span>
                        <p className="text-[10px] text-ink-soft">Tỷ lệ chuyển đổi</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="rounded-xl bg-tile p-3">
                        <span className="text-lg font-bold text-ink">{metricsData.variantB.threads}</span>
                        <p className="text-[11px] text-ink-soft">Khách hàng (Threads)</p>
                      </div>
                      <div className="rounded-xl bg-tile p-3">
                        <span className="text-lg font-bold text-ink">{metricsData.variantB.turns}</span>
                        <p className="text-[11px] text-ink-soft">Lượt phản hồi</p>
                      </div>
                      <div className="rounded-xl bg-tile p-3">
                        <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                          {metricsData.variantB.leads}
                        </span>
                        <p className="text-[11px] text-ink-soft">Lead VIP thu được</p>
                      </div>
                      <div className="rounded-xl bg-tile p-3">
                        <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                          {metricsData.variantB.appointments}
                        </span>
                        <p className="text-[11px] text-ink-soft">Lịch hẹn Cafe</p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-ink">Persona thử nghiệm:</span>
                      <div className="max-h-36 overflow-y-auto rounded-lg border border-line bg-canvas p-2.5 font-mono text-[11px] leading-relaxed text-ink-soft whitespace-pre-wrap">
                        {selectedExp.variantBPersona}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal tạo thử nghiệm */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-surface p-6 shadow-2xl border border-line max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-bold text-ink">Tạo thử nghiệm A/B Persona mới</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-ink-soft hover:bg-tile"
              >
                <IconClose size={18} />
              </button>
            </div>

            {formError && <p className="mt-3 text-xs text-red-500">{formError}</p>}

            <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Mã thử nghiệm (ID)</label>
                  <input
                    className="gc-input w-full font-mono text-xs"
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                    placeholder="exp-prive-style"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Agent áp dụng</label>
                  <select
                    className="gc-input w-full text-xs"
                    value={formAgentId}
                    onChange={(e) => {
                      setFormAgentId(e.target.value);
                      const a = agents.find((ag) => ag.id === e.target.value);
                      if (a) setFormVarAPersona(a.persona || "");
                    }}
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.id}){a.isDefault ? " ⭐ [Mặc định]" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Tên thử nghiệm</label>
                <input
                  className="gc-input w-full text-xs"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Thử nghiệm phong cách tư vấn chủ động The Privé"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Tỷ lệ phân bổ traffic cho Variant B: {formRatio}% (Variant A: {100 - formRatio}%)
                </label>
                <input
                  type="range"
                  min={10}
                  max={90}
                  step={5}
                  value={formRatio}
                  onChange={(e) => setFormRatio(parseInt(e.target.value, 10))}
                  className="w-full accent-zalo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Tên Variant A</label>
                  <input
                    className="gc-input w-full text-xs mb-2"
                    value={formVarAName}
                    onChange={(e) => setFormVarAName(e.target.value)}
                  />
                  <label className="block text-xs font-semibold text-ink mb-1">Persona Variant A (Gốc)</label>
                  <textarea
                    className="gc-input w-full h-36 font-mono text-xs"
                    value={formVarAPersona}
                    onChange={(e) => setFormVarAPersona(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Tên Variant B</label>
                  <input
                    className="gc-input w-full text-xs mb-2"
                    value={formVarBName}
                    onChange={(e) => setFormVarBName(e.target.value)}
                  />
                  <label className="block text-xs font-semibold text-ink mb-1">Persona Variant B (Mới)</label>
                  <textarea
                    className="gc-input w-full h-36 font-mono text-xs"
                    value={formVarBPersona}
                    onChange={(e) => setFormVarBPersona(e.target.value)}
                    placeholder="Nhập nội dung persona thử nghiệm mới..."
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-line px-4 py-2 text-xs font-medium text-ink-soft hover:bg-tile"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleCreate}
                className="rounded-lg bg-zalo-500 px-4 py-2 text-xs font-medium text-white hover:bg-zalo-600 disabled:opacity-50"
              >
                {saving ? "Đang tạo..." : "Lưu thử nghiệm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
