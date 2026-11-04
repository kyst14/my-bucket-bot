# build
FROM oven/bun:1.2-debian AS builder

WORKDIR /app

COPY package.json bun.lock* package-lock.json* ./

RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

# tsc + tsc-alias
RUN bun run build

# ——— runtime ———
FROM oven/bun:1.2-debian

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    ca-certificates \
    curl \
  && pip3 install --break-system-packages --no-cache-dir yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV DOWNLOADS_DIR=/tmp/downloads

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist

RUN mkdir -p /tmp/downloads

EXPOSE 10000

CMD ["bun", "run", "dist/index.js"]