# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build arguments for API URL
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build Next.js application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Set correct ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3001

ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
