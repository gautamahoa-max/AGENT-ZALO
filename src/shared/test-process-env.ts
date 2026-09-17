// Một số test thuần import module cấu hình ở top-level. Đặt các secret giả
// dùng riêng cho test trước khi Node nạp test file để fresh clone không phụ
// thuộc vào .env cá nhân của máy phát triển.
process.env.NODE_ENV ??= "test";
process.env.CREDENTIALS_ENCRYPTION_KEY ??= "0".repeat(64);
process.env.LLM_PROVIDER ??= "anthropic";
process.env.LLM_API_KEY ??= "test-key";
process.env.LLM_MODEL ??= "test-model";
process.env.LOG_FILE_ENABLED ??= "false";
