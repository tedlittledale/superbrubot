# Official Playwright image — Chromium + all system libraries preinstalled,
# pinned to the same Playwright version as package.json.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV TICK_INTERVAL_SECONDS=60
# No persistent volume on this deploy, so keep the resend window short: a match
# is only eligible for 20 min after kickoff. Picks reveal at kickoff, so that's
# ample, and a restart >20 min later won't re-post. Override via env if desired.
ENV SEND_WINDOW_MINUTES=20

CMD ["node", "src/worker.js"]
