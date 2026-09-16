import { useCallback, useEffect, useState } from "react";
import type { AccountInfo, MemoryFactItem } from "../dashboard-api-client";
import { api } from "../dashboard-api-client";
import { PageHeader } from "../layout/page-header";
import { IconBrain, IconRefresh } from "../shared/dashboard-icons";
import { AccountFilter, accountLabel } from "../shared/account-filter";
import { Badge, EmptyRow, formatTime, ListToolbar, TableShell } from "../shared/ui-bits";

export function MemoryPage({ accounts }: { accounts: AccountInfo[] }) {
  const [items, setItems] = useState<MemoryFactItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [page, setPage] = useState(0);

  // Trạng thái đồng bộ NotebookLM
  const [syncStatus, setSyncStatus] = useState<{
    lastSyncAt: string | null;
    syncedSourcesCount: number;
    history: any[];
    isSyncRunning: boolean;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    type: "success" | "error";
    text: string;
    details?: string;
  } | null>(null);

  const showAccountColumn = accounts.length > 1;

  const reloadSyncStatus = useCallback(() => {
    api
      .notebookSyncStatus()
      .then(setSyncStatus)
      .catch(() => setSyncStatus(null));
  }, []);

  const reload = useCallback(() => {
    api
      .memories(accountFilter, query, page)
      .then((data) => {
        setItems(data.items);
        setHasMore(data.hasMore);
      })
      .catch(() => setItems([]));
  }, [accountFilter, query, page]);

  useEffect(() => {
    reload();
    reloadSyncStatus();
  }, [reload, reloadSyncStatus]);

  useEffect(() => setPage(0), [accountFilter, query]);

  async function handleSync(forceAll = false) {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.runNotebookSync(forceAll);
      if (res.success) {
        let details = "";
        if (res.newSourcesCount > 0) {
          details = res.processedSources
            .map((s) => `• [${s.notebookTitle}] ${s.title}: ${s.summary}`)
            .join("\n");
        }
        setSyncResult({
          type: "success",
          text: res.message,
          details,
        });
      } else {
        setSyncResult({
          type: "error",
          text: res.message || "Đồng bộ thất bại",
        });
      }
      reloadSyncStatus();
    } catch (err: any) {
      setSyncResult({
        type: "error",
        text: "Lỗi kết nối khi đồng bộ NotebookLM",
        details: err.message || String(err),
      });
    } finally {
      setSyncing(false);
    }
  }

  async function remove(fact: MemoryFactItem) {
    await api.deleteMemory(fact.accountId, fact.id);
    reload();
  }

  return (
    <div>
      <PageHeader
        icon={IconBrain}
        title="Bộ nhớ dữ liệu"
        subtitle="Thông tin bot tự ghi nhớ qua tool save_memory (dùng để cá nhân hóa tư vấn khách hàng)"
      />

      {/* Khối Đồng bộ Kho tri thức Google NotebookLM */}
      <div className="mb-6 rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zalo-50 text-zalo-600 dark:bg-zalo-950/40 dark:text-zalo-400">
              <IconRefresh className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-ink">Kho tri thức Google NotebookLM</h3>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  🟢 Kết nối MCP Sẵn sàng
                </span>
              </div>
              <p className="mt-1 text-[13px] text-ink-soft">
                Tự động quét tài liệu mới trên NotebookLM để chắt lọc quy tắc vào Persona & nạp vào SQLite Fallback.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-4 text-[12px] text-ink-soft/80">
                <span>📚 Đã lập chỉ mục: <strong>{syncStatus?.syncedSourcesCount ?? "..."} tài liệu</strong></span>
                <span>•</span>
                <span>🕒 Lần đồng bộ cuối: <strong>{syncStatus?.lastSyncAt ? formatTime(syncStatus.lastSyncAt) : "Chưa có"}</strong></span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleSync(false)}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-xl bg-zalo-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-zalo-700 disabled:opacity-50 transition-colors"
            >
              {syncing ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Đang đồng bộ...
                </>
              ) : (
                <>
                  <IconRefresh className="h-4 w-4" />
                  Đồng bộ từ NotebookLM
                </>
              )}
            </button>
          </div>
        </div>

        {syncResult && (
          <div
            className={`mt-4 rounded-xl p-3.5 text-[13px] ${
              syncResult.type === "success"
                ? "border border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border border-rose-200/80 bg-rose-50 text-rose-800 dark:border-rose-800/40 dark:bg-rose-950/40 dark:text-rose-300"
            }`}
          >
            <div className="font-semibold">{syncResult.text}</div>
            {syncResult.details && (
              <div className="mt-2 whitespace-pre-wrap rounded-lg bg-surface/80 p-2.5 font-mono text-[12px] leading-relaxed text-ink shadow-inner">
                {syncResult.details}
              </div>
            )}
          </div>
        )}
      </div>

      <ListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Tìm trong nội dung hoặc ID đối tượng..."
        filter={<AccountFilter accounts={accounts} value={accountFilter} onChange={setAccountFilter} />}
        page={page}
        hasMore={hasMore}
        onPage={setPage}
      />

      <TableShell
        headers={
          showAccountColumn
            ? ["Ghi nhớ", "Tài khoản", "Về", "Học từ", "Thời gian", ""]
            : ["Ghi nhớ", "Về", "Học từ", "Thời gian", ""]
        }
        minWidth={showAccountColumn ? 880 : 780}
      >
        {items.length === 0 && (
          <EmptyRow colSpan={showAccountColumn ? 6 : 5} text="Bot chưa ghi nhớ gì" />
        )}
        {items.map((m) => (
          <tr key={m.id} className="border-b border-line/60 last:border-0 hover:bg-tile/40">
            <td className="max-w-md px-4 py-3 text-ink">{m.content}</td>
            {showAccountColumn && (
              <td className="px-4 py-3">
                <Badge tone="gray" dot={false}>{accountLabel(accounts, m.accountId)}</Badge>
              </td>
            )}
            <td className="px-4 py-3 text-ink-soft">{m.subjectId}</td>
            <td className="px-4 py-3">
              <Badge tone={m.learnedInGroup ? "amber" : "blue"} dot={false}>
                {m.learnedInGroup ? "Nhóm" : "Chat riêng"}
              </Badge>
            </td>
            <td className="px-4 py-3 text-ink-soft">{formatTime(m.createdAt)}</td>
            <td className="px-4 py-3">
              <button onClick={() => remove(m)} className="text-[13px] text-red-600 dark:text-red-400 hover:underline">
                Xóa
              </button>
            </td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
}
