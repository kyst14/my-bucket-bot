# ========== BUILD ==========
FROM oven/bun:latest AS builder

WORKDIR /app

COPY package.json bun.lock* package-lock.json* ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
COPY locales ./locales

RUN bun run build

# ========== RUNTIME ==========
FROM oven/bun:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    ca-certificates \
    curl \
    nodejs \
  && python3 -m pip install \
    --break-system-packages \
    --no-cache-dir \
    --pre \
    -U "yt-dlp[default]" \
  && yt-dlp --version \
  && node --version \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV DOWNLOADS_DIR=/tmp/downloads
ENV YTDLP_JS_RUNTIME=node

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/locales ./locales

RUN mkdir -p /tmp/downloads

EXPOSE 10000

CMD ["bun", "run", "dist/index.js"]