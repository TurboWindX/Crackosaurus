# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy everything
COPY . .

# Install all dependencies
RUN npm ci

# Copy db files for Prisma generation
COPY apps/db ./apps/db

# Generate Prisma schema by merging common + sqlite schemas in the app directory
RUN cat apps/db/schemas/sqlite.prisma > schema.prisma && \
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
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* turbo.json ./
COPY apps/server/package.json ./apps/server/
COPY packages ./packages

# Install production dependencies
RUN npm ci --omit=dev

# Copy generated Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy built application from builder
COPY --from=builder /app/apps/server/dist ./apps/server/dist

# Copy built web frontend to public folder
COPY --from=builder /app/apps/web/dist ./public

# Copy database migrations and schema for SQLite
COPY --from=builder /app/apps/db/providers/sqlite/migrations ./migrations
COPY --from=builder /app/schema.prisma ./schema.prisma

# Create entrypoint script to run migrations before starting server
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'set -e' >> /entrypoint.sh && \
    echo 'echo "Running database migrations..."' >> /entrypoint.sh && \
    echo 'npx prisma migrate deploy --schema=/app/schema.prisma' >> /entrypoint.sh && \
    echo 'echo "Starting server..."' >> /entrypoint.sh && \
    echo 'exec node apps/server/dist/index.js' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh

# Set environment
ENV NODE_ENV=production

# Expose server port
EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]

# Start the server
CMD ["node", "apps/server/dist/index.js"]
