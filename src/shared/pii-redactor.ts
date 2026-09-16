export function redactPII(text: string): string {
  if (!text) return text;
  let redacted = text;

  // Mask Phone numbers (Vietnamese format): 0xx xxxx xxx or +84...
  // Matches: 0901234567, 090 123 4567, 090.123.4567, +84901234567
  const phoneRegex = /(?:\+84|0)[ \-\.]?[1-9](?:[ \-\.]?\d){8}\b/g;
  redacted = redacted.replace(phoneRegex, "[SĐT_KHÁCH]");

  // Mask CCCD / CMND (9 or 12 digits)
  // Needs to be careful not to mask amounts like 1,000,000,000 or 1000000000
  // Usually CCCD is 12 digits exactly, CMND is 9 digits exactly, often starting with 0 for CCCD.
  const cccdRegex = /\b0\d{11}\b|\b\d{9}\b/g;
  redacted = redacted.replace(cccdRegex, "[CCCD_KHÁCH]");

  // Mask Email addresses
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  redacted = redacted.replace(emailRegex, "[EMAIL_KHÁCH]");

  return redacted;
}
