// PM2 Ecosystem Config cho zalo-agent
// Dùng .cjs vì PM2 chạy CommonJS; dự án ESM nhưng PM2 chỉ đọc file này
module.exports = {
  apps: [
    {
      name: "zalo-agent",
      script: "npx",
      args: "tsx src/index.ts",
      cwd: __dirname,

      // Restart policy
      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",
      restart_delay: 3000,
      exp_backoff_restart_delay: 1000,

      // Resource limits
      max_memory_restart: "1800M",

      // Environment
      env: {
        NODE_ENV: "production",
      },

      // Logging — PM2 tự rotate, bổ sung cho Pino file logs
      error_file: "data/logs/pm2-error.log",
      out_file: "data/logs/pm2-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",

      // Watch — TẮT trong production
      watch: false,

      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 15000,
      shutdown_with_message: true,
    },
  ],
};
