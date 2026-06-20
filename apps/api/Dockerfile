# syntax=docker/dockerfile:1
# Stage 1: Dependencies
FROM node:24-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy workspace manifests for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/ui/package.json ./packages/ui/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

COPY . .

# Generate Prisma client (required before building API)
RUN pnpm --filter @cargo-sentinel/database exec prisma generate

# Build all packages in dependency order
RUN pnpm --filter @cargo-sentinel/shared build
RUN pnpm --filter @cargo-sentinel/database build
RUN pnpm --filter @cargo-sentinel/api build

# Stage 3: Runtime
FROM node:24-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/.npmrc ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/database ./packages/database
COPY --from=builder /app/packages/ui ./packages/ui
COPY --from=builder /app/apps/api ./apps/api

EXPOSE 4000

CMD ["node", "apps/api/dist/index.js"]
