# Official Playwright image — Chromium + all system libraries preinstalled,
# pinned to the same Playwright version as package.json.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Persist the session + sent-state across restarts when a volume is mounted here.
ENV TICK_INTERVAL_SECONDS=60

CMD ["node", "src/worker.js"]
