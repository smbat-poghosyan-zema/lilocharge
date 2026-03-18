# Multi-stage build for production
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8.15.0

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json tsconfig.json ./

# Copy packages
COPY packages/ ./packages/

# Copy API app
COPY apps/api/ ./apps/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
WORKDIR /app/apps/api
RUN pnpm prisma:generate

# Build the application
WORKDIR /app
RUN pnpm build --filter=@lilocharge/api

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8.15.0

# Install production dependencies only
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/prisma/ ./apps/api/prisma/

RUN pnpm install --frozen-lockfile --prod

# Copy built application
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma

# Create non-root user
RUN addgroup -g 1000 nodejs && \
    adduser -u 1000 -G nodejs -s /bin/sh -D nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

WORKDIR /app/apps/api

# Expose ports
EXPOSE 3000 9464

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/main.js"]
