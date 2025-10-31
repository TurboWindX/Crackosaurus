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

# Build the cluster
RUN npm run build --workspace=@repo/cluster

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* turbo.json ./
COPY apps/cluster/package.json ./apps/cluster/
COPY packages ./packages

# Install production dependencies
RUN npm ci --omit=dev

# Copy generated Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy built application from builder
COPY --from=builder /app/apps/cluster/dist ./apps/cluster/dist

# Set environment
ENV NODE_ENV=production

# Expose cluster port
EXPOSE 13337

# Start the cluster
CMD ["node", "apps/cluster/dist/index.js"]
