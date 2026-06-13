# Superbru → Telegram

Posts your Superbru World Cup prediction-group update (everyone's picks + current
standings) to a Telegram group at each fixture's deadline.

> **Timing note:** Superbru hides other players' picks until the deadline (kickoff),
> so the bot is designed to fire **at the deadline**, when picks unlock. Standings
> are available any time.

## Status

- [x] **Phase 1** — Project scaffold + Telegram sending
- [x] **Phase 2** — Superbru scraper (login → picks + standings, formatted message)
- [x] **Phase 3** — Scheduling: fire at each match's kickoff, deploy on a VPS

## How it works

1. `data/fixtures.json` holds every group match with its **UTC kickoff** (built from the
   public schedule) and its Superbru **match number** (`g`).
2. A **tick** (`src/cli/tick.js`) runs every minute on the VPS. It finds fixtures whose
   kickoff has just passed and that haven't been announced, scrapes that match's
   predictions + the standings, posts to Telegram, and records it in `data/sent.json`.
3. Predicted scores only reveal at kickoff (before that they show as `?-?`), so the tick
   retries each minute until they appear — then sends once.

```bash
node src/cli/tick.js --dry   # show what would be sent right now (no posting)
node src/cli/tick.js         # live: scrape + post any due fixtures
```

### Updating the schedule

Edit the schedule/team-map in `scripts/buildFixtures.js`, then:

```bash
node scripts/buildFixtures.js   # regenerates data/fixtures.json
```

Knockout fixtures (teams TBD until the draws) can be appended the same way once known.

### Key facts (discovered during calibration)

- Pool "Twelve years no poo" id: **13208945** (you're also in "England Fans" 13114710).
- Pool pages live under `/worldcup_predictor/pool.php` (note: no underscore).
- Standings: `pool.php?p=<id>&tab=leaderboard#tab=leaderboard`.
- Per-match picks: `pool_view.php?t=1296&p=<id>&g=<matchNumber>&view=matches` — where `g`
  is the **global match number** (USA-Paraguay = 4, Qatar-Switzerland = 5, …). The tick
  confirms each match by team code and probes nearby `g` values to self-correct drift.

## Deploy on Railway (recommended)

The repo ships a `Dockerfile` (official Playwright image) and a `worker` that ticks
every minute, so Railway just needs to run the container.

1. **Create the service**
   - Railway → *New Project* → *Deploy from GitHub repo* → `tedlittledale/superbrubot`.
   - It auto-detects the `Dockerfile` (also pinned in `railway.json`).
2. **Set environment variables** (Service → *Variables*):
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
   - `SUPERBRU_EMAIL`, `SUPERBRU_PASSWORD`
   - `STATE_DIR=/data`  ← so the session + sent-record persist
3. **Add a volume** (Service → *Settings* → *Volumes*): mount path `/data`.
   This keeps `data/fixtures.json` (baked into the image at `/app/data`) separate from
   the persisted state at `/data`, so restarts don't resend matches.
4. **Deploy.** Logs should show `Superbru worker started — ticking every 60s.` and
   `nothing due` until a match kicks off.

No public networking / domain is needed — it's a background worker, not a web service.

## Deploy on a VPS

```bash
# one-time on the server
git clone <repo> superbru && cd superbru
npm install
npx playwright install --with-deps chromium   # browser + system libs
cp .env.example .env                           # fill in credentials + chat id
node src/cli/tick.js --dry                     # sanity check

# schedule it (cron) — edit paths in the file first
crontab deploy/crontab.example
# …or systemd:  cp deploy/superbru-tick.* /etc/systemd/system/ && \
#               systemctl enable --now superbru-tick.timer
```

The first live run logs in with your `.env` credentials and saves the session to
`auth/state.json`; later runs reuse it and only re-login when it expires.

## Setup

```bash
npm install
cp .env.example .env   # then fill it in
```

### 1. Create the Telegram bot

1. In Telegram, message **@BotFather** → `/newbot` → follow prompts.
2. Copy the token it gives you into `TELEGRAM_BOT_TOKEN` in `.env`.
3. Create your group (or use an existing one) and **add the bot to it**.
4. Send any message in the group.
5. Find the group's chat id:
   ```bash
   npm run test:telegram      # prints chat ids the bot can see
   ```
   Copy the negative group id into `TELEGRAM_CHAT_ID` in `.env`.

### 2. Test sending

```bash
npm run test:telegram        # sends a confirmation message to the group
node src/cli/preview.js --send   # sends a sample formatted update
```

## Scripts

| Command                        | What it does                                         |
| ------------------------------ | ---------------------------------------------------- |
| `npm run chatid`               | List chat ids the bot can see (first-time setup)     |
| `npm run test:telegram`        | Send a test message to the group                     |
| `node src/cli/preview.js`      | Print a sample update (add `--send` to post it)      |
| `npm run scrape`               | Scrape Superbru and print the raw data as JSON       |
| `npm run run`                  | Scrape + format the update (add `--send` to post it) |
| `npm run dump:dashboard`       | Re-calibration: dump the logged-in dashboard         |
