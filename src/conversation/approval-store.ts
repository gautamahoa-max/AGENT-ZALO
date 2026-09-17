import { db } from "./database.js";

export type PendingApproval = {
  id: string;
  filePath: string;
  caption: string;
  threadId: string;
  threadType: number;
  accountId: string;
  status: "pending" | "sending" | "sent" | "expired";
  lastError: string;
  createdAt: string;
  expiresAt: string;
  sentAt: string | null;
};

type Row = {
  id: string;
  file_path: string;
  caption: string;
  thread_id: string;
  thread_type: number;
  account_id: string;
  status: PendingApproval["status"];
  last_error: string;
  created_at: string;
  expires_at: string;
  sent_at: string | null;
};

const toApproval = (row: Row): PendingApproval => ({
  id: row.id,
  filePath: row.file_path,
  caption: row.caption,
  threadId: row.thread_id,
  threadType: row.thread_type,
  accountId: row.account_id,
  status: row.status,
  lastError: row.last_error,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  sentAt: row.sent_at,
});

export function savePendingApproval(input: {
  id: string;
  filePath: string;
  caption: string;
  threadId: string;
  threadType: number;
  accountId: string;
  expiresAt?: string;
}): PendingApproval {
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO pending_approvals (
       id, file_path, caption, thread_id, thread_type, account_id, expires_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       file_path = excluded.file_path,
       caption = excluded.caption,
       thread_id = excluded.thread_id,
       thread_type = excluded.thread_type,
       account_id = excluded.account_id,
       status = 'pending',
       last_error = '',
       expires_at = excluded.expires_at,
       sent_at = NULL`,
  ).run(
    input.id,
    input.filePath,
    input.caption,
    input.threadId,
    input.threadType,
    input.accountId,
    expiresAt,
  );
  return getApproval(input.id)!;
}

export function getApproval(id: string): PendingApproval | null {
  const row = db.prepare("SELECT * FROM pending_approvals WHERE id = ?").get(id) as Row | undefined;
  if (!row) return null;
  if (row.status === "pending" && Date.parse(row.expires_at) <= Date.now()) {
    db.prepare("UPDATE pending_approvals SET status = 'expired' WHERE id = ? AND status = 'pending'").run(id);
    row.status = "expired";
  }
  return toApproval(row);
}

/** Giành quyền gửi nguyên tử; chỉ một request đồng thời nhận được record. */
export function claimPendingApproval(id: string): PendingApproval | null {
  const result = db.prepare(
    `UPDATE pending_approvals
     SET status = 'sending', last_error = ''
     WHERE id = ? AND status = 'pending' AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run(id);
  if (Number(result.changes) === 0) return null;

  const row = db
    .prepare("SELECT * FROM pending_approvals WHERE id = ? AND status = 'sending'")
    .get(id) as Row | undefined;
  return row ? toApproval(row) : null;
}

export function markApprovalSent(id: string): void {
  db.prepare(
    `UPDATE pending_approvals
     SET status = 'sent', sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = ''
     WHERE id = ? AND status = 'sending'`,
  ).run(id);
}

/** Cho phép thử lại sau lỗi gửi; lỗi được giữ để chủ tài khoản nhìn thấy. */
export function releaseApprovalAfterFailure(id: string, error: string): void {
  db.prepare(
    `UPDATE pending_approvals
     SET status = 'pending', last_error = ?
     WHERE id = ? AND status = 'sending'`,
  ).run(error.slice(0, 1000), id);
}
