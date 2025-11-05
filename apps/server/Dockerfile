# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy everything
COPY . .

# Install all dependencies
RUN npm ci

# Copy db files for Prisma generation
COPY apps/db ./apps/db

# Generate Prisma schema by merging common + postgresql schemas in the app directory
RUN cat apps/db/schemas/postgresql.prisma > schema.prisma && \
    echo "" >> schema.prisma && \
    echo "// Common models" >> schema.prisma && \
    cat apps/db/schemas/common.prisma >> schema.prisma && \
    npx prisma generate --schema=schema.prisma

# Build the server
RUN npm run build --workspace=@repo/server

# Build UI packages required by web
RUN npm run build --workspace=@repo/shadcn
RUN npm run build --workspace=@repo/ui

# Build the web frontend with backend config set to use same host
# USE_WEB_HOST tells the frontend to use window.location for API calls
ENV BACKEND_HOST=USE_WEB_HOST
ENV BACKEND_PORT=80
RUN npm run build --workspace=@repo/web

# Production stage
FROM node:20-alpine AS runtime

WORKDIR /app

# Create non-root user for better security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy minimal package files and install production deps
COPY package.json package-lock.json* turbo.json ./
COPY apps/server/package.json ./apps/server/
COPY packages ./packages

RUN npm ci --omit=dev --no-audit --no-fund


# Copy entrypoint script
COPY apps/server/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Use non-root user
RUN chown -R appuser:appgroup /app
USER appuser

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- --timeout=2 http://localhost:8080/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
