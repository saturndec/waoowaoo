# pin Node version for reproducible builds
ARG NODE_VERSION=20.19.2

# ==================== Stage 1: Dependencies ====================
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ==================== Stage 2: Build ====================
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma generate + Next.js build
RUN npm run build

# ==================== Stage 3: Production ====================
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache tini

# node_modules（含 devDeps，因为 npm run start 需要 concurrently + tsx）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Next.js 构建产物
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Prisma schema（db push 需要）
COPY --from=builder /app/prisma ./prisma

# Worker 和 Watchdog 源码（tsx 运行 TypeScript）
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib

# 定价和配置标准
COPY --from=builder /app/standards ./standards

# 国际化 + 配置文件
COPY --from=builder /app/messages ./messages
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/middleware.ts ./middleware.ts
COPY --from=builder /app/postcss.config.mjs ./postcss.config.mjs

# 本地存储数据目录 + 空 .env（tsx --env-file=.env 需要文件存在，实际 env 由 docker-compose 注入）
RUN mkdir -p /app/data/uploads /app/logs && touch /app/.env

EXPOSE 3000 3010

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "start"]
