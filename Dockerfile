# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Install ffmpeg, poppler-utils for file processing
# Install fonts for LibreOffice to properly render text
RUN apk add --no-cache \
    ffmpeg \
    poppler-utils \
    libreoffice \
    fontconfig \
    font-noto \
    font-noto-cjk \
    ttf-dejavu \
    ttf-liberation \
    ttf-freefont \
    && fc-cache -f

# Copy built files
COPY --from=builder /app/dist ./dist

# Create temp directory
RUN mkdir -p /app/temp

EXPOSE 3000

CMD ["node", "dist/main"]
