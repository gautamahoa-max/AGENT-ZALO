import { getDateTimeParts } from "../shared/current-datetime.js";

const POLICY_WINDOWS = [
  { id: "QĐ 617.01/2026/QĐ-TGĐ", validFrom: "2026-08-10", validTo: "2026-10-07" },
  { id: "QĐ 693.01/2026/QĐ-TGĐ", validFrom: "2026-09-15", validTo: "2026-12-31" },
] as const;

function localIsoDate(timeZone: string, now: Date): string {
  const [day, month, year] = getDateTimeParts(timeZone, now).date.split("/");
  return `${year}-${month}-${day}`;
}

/** Chốt fail-closed ở prompt cho các chính sách có cửa sổ đã biết. */
export function policyValiditySection(timeZone: string, now = new Date()): string {
  const today = localIsoDate(timeZone, now);
  const lines = POLICY_WINDOWS.map((policy) => {
    if (today < policy.validFrom) {
      return `- ${policy.id}: CHƯA CÓ HIỆU LỰC; không dùng số liệu của chính sách này.`;
    }
    if (today > policy.validTo) {
      return `- ${policy.id}: ĐÃ HẾT HIỆU LỰC ngày ${policy.validTo}; cấm báo lãi suất/phí từ chính sách này, phải chuyển Hoà kiểm tra văn bản thay thế.`;
    }
    return `- ${policy.id}: hiệu lực đến hết ${policy.validTo}; khi dùng phải nói đây là chính sách theo thời kỳ và nêu ngày hiệu lực.`;
  });
  return `Kiểm soát hiệu lực chính sách tại ngày ${today}:\n${lines.join("\n")}`;
}
