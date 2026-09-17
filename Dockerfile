# ============================================================
# Stage 1: Install dependencies
# ============================================================
FROM node:22-slim AS deps

# corepack cần để kích hoạt pnpm đúng version lock trong package.json
RUN corepack enable

WORKDIR /app

# Copy lockfile trước để tận dụng Docker layer cache
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ============================================================
# Stage 2: Build web dashboard (React + Vite)
# ============================================================
FROM deps AS web-builder

COPY . .
RUN pnpm build:web

# ============================================================
# Stage 3: Production runtime
# ============================================================
FROM node:22-slim AS runtime

RUN corepack enable

WORKDIR /app

# Copy dependencies và source code
COPY --from=deps /app/node_modules ./node_modules
COPY --from=web-builder /app/web/dist ./web/dist
COPY package.json pnpm-lock.yaml ./
COPY src/ ./src/
COPY personas/ ./personas/
COPY tsconfig.json tsconfig.build.json ./

# data/ được mount volume bên ngoài — tạo thư mục rỗng cho lần chạy đầu
RUN mkdir -p /app/data/logs /app/data/media /app/data/tmp /app/data/accounts

# Dashboard mặc định bind :3900
EXPOSE 3900

# Health check: ping dashboard endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3900/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Entry point: tsx chạy trực tiếp TypeScript (giống pnpm start)
CMD ["npx", "tsx", "src/index.ts"]
