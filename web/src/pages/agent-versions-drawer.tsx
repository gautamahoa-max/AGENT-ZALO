import { useEffect, useState } from "react";
import { api, type PersonaVersionItem } from "../dashboard-api-client";
import { IconClose } from "../shared/dashboard-icons";

export function AgentVersionsDrawer({
  agentId,
  currentPersona,
  isOpen,
  onClose,
  onRollbackSuccess,
}: {
  agentId: string;
  currentPersona: string;
  isOpen: boolean;
  onClose: () => void;
  onRollbackSuccess: (persona: string) => void;
}) {
  const [versions, setVersions] = useState<PersonaVersionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVer, setSelectedVer] = useState<PersonaVersionItem | null>(null);
  const [rollbacking, setRollbacking] = useState(false);
  const [error, setError] = useState("");

  const loadVersions = () => {
    if (!agentId) return;
    setLoading(true);
    setError("");
    api.agentsAdmin
      .versions(agentId)
      .then((res) => {
        setVersions(res.items);
        if (res.items.length > 0 && !selectedVer) {
          setSelectedVer(res.items[0]);
        }
      })
      .catch((err) => setError(err.message || "Không thể tải lịch sử phiên bản"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      loadVersions();
    }
  }, [isOpen, agentId]);

  if (!isOpen) return null;

  const handleRollback = async (ver: PersonaVersionItem) => {
    if (!confirm(`Bạn có chắc chắn muốn khôi phục persona về phiên bản v${ver.version}?`)) {
      return;
    }
    setRollbacking(true);
    try {
      const res = await api.agentsAdmin.rollbackVersion(agentId, ver.version);
      if (res.ok && res.version) {
        onRollbackSuccess(res.version.persona);
        loadVersions();
      }
    } catch (err: any) {
      alert(err.message || "Khôi phục thất bại");
    } finally {
      setRollbacking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="flex h-full w-full max-w-3xl flex-col bg-surface shadow-2xl border-l border-line">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Lịch sử phiên bản Persona</h2>
            <p className="text-[13px] text-ink-soft">
              Theo dõi các lần thay đổi prompt chỉ dẫn và khôi phục (rollback) chỉ với 1 click.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-soft hover:bg-tile hover:text-ink"
          >
            <IconClose size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex flex-1 min-h-0 divide-x divide-line">
          {/* Left Column: Version List */}
          <div className="w-1/3 overflow-y-auto p-4 space-y-2">
            {loading && <p className="text-xs text-ink-soft p-2">Đang tải lịch sử...</p>}
            {error && <p className="text-xs text-red-500 p-2">{error}</p>}
            {!loading && versions.length === 0 && (
              <p className="text-xs text-ink-soft p-2">Chưa có phiên bản nào được lưu.</p>
            )}

            {versions.map((ver) => {
              const isSelected = selectedVer?.id === ver.id;
              const isCurrent = ver.persona.trim() === currentPersona.trim();

              return (
                <div
                  key={ver.id}
                  onClick={() => setSelectedVer(ver)}
                  className={`cursor-pointer rounded-xl border p-3 transition-all ${
                    isSelected
                      ? "border-zalo-500 bg-zalo-50/20 dark:bg-zalo-900/10 shadow-sm"
                      : "border-line bg-surface hover:bg-tile"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-zalo-600 dark:text-zalo-400">
                      v{ver.version}
                    </span>
                    {isCurrent && (
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                        Đang dùng
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs font-medium text-ink">
                    {ver.changeNote || "Cập nhật persona"}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-ink-soft">
                    <span>{ver.persona.length.toLocaleString()} ký tự</span>
                    <span>{new Date(ver.createdAt).toLocaleDateString("vi-VN")}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Version Details & Preview */}
          <div className="flex-1 flex flex-col min-h-0 p-6 overflow-hidden">
            {selectedVer ? (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between pb-3 border-b border-line mb-3">
                  <div>
                    <h3 className="font-semibold text-ink text-sm">
                      Phiên bản v{selectedVer.version} - {selectedVer.name}
                    </h3>
                    <p className="text-[12px] text-ink-soft">
                      Tạo lúc: {new Date(selectedVer.createdAt).toLocaleString("vi-VN")} ({selectedVer.createdBy})
                    </p>
                  </div>
                  {selectedVer.persona.trim() !== currentPersona.trim() && (
                    <button
                      type="button"
                      disabled={rollbacking}
                      onClick={() => handleRollback(selectedVer)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {rollbacking ? "Đang khôi phục..." : "Khôi phục bản này"}
                    </button>
                  )}
                </div>

                {selectedVer.changeNote && (
                  <div className="mb-3 rounded-lg bg-tile p-2.5 text-xs text-ink-soft">
                    <strong className="text-ink">Ghi chú:</strong> {selectedVer.changeNote}
                  </div>
                )}

                <div className="flex-1 min-h-0 flex flex-col">
                  <span className="text-xs font-medium text-ink mb-1.5">Nội dung prompt chỉ dẫn:</span>
                  <div className="flex-1 overflow-y-auto rounded-lg border border-line bg-canvas p-3 font-mono text-xs leading-relaxed text-ink whitespace-pre-wrap select-text">
                    {selectedVer.persona}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-ink-soft">
                Chọn một phiên bản bên trái để xem nội dung
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
