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
2. A **tick** (`src/cli/tick.js`) runs every minute on the VPS. Each fixture gets **two**
   announcements, recorded separately in `data/sent.json`:
   - **Predictions** — at kickoff, once everyone's picks reveal: the predicted scores +
     the current standings.
   - **Result** — after full time, once the match is scored: the final score, **how
     everyone fared** (each player's pick + the points they scored, best first), and the
     **updated standings**.
3. Predicted scores only reveal at kickoff (before that they show as `?-?`), so the tick
   retries each minute until they appear — then sends once. The result message works the
   same way: the tick starts checking `RESULT_OFFSET_MINUTES` (default 110) after kickoff
   and retries until Superbru has graded the match, then sends once.

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
3. **Deploy.** Logs should show `Superbru worker started — ticking every 60s.` and
   `nothing due` until a match kicks off.

No public networking / domain is needed — it's a background worker, not a web service.

### Test the deploy without waiting for a match

Set a **`SELFTEST`** variable, redeploy, then remove it. The self-test always posts a
plain Telegram ping first (verifies the bot token + chat id; isolates any `chat not
found` problem from Superbru), then:

- `SELFTEST=1` — logs into Superbru and posts **both** live notifications for the
  **previous match** (the most recently kicked-off fixture): the predictions message and
  the result message. So every redeploy is a sense check of how both look on real data.
- `SELFTEST=ping` — ping only; skips the Superbru scrape.
- `SELFTEST=5` — same full check but for a specific match number (the pool_view `g`,
  e.g. 5 = Qatar-Switzerland) instead of the previous match.

Both Superbru messages are clearly prefixed `🧪 SELF-TEST … (not a live alert)`.

Locally the same thing: `npm run selftest` (previous match), `npm run selftest ping`, or
`npm run selftest 5`.

> `chat not found` means `TELEGRAM_CHAT_ID` is wrong or the bot isn't in the group. Add the
> bot to the group, post any message there, run `npm run chatid`, and use the negative id.

> **No volume on this deploy.** State is in-memory, so the Dockerfile sets
> `SEND_WINDOW_MINUTES=20` — a match is only eligible for 20 min after kickoff, so a
> container restart more than 20 min later won't re-post it. If you'd rather persist
> state and use the longer default window, attach a volume at `/data` and set
> `STATE_DIR=/data` (via ⌘K → "volume", or right-click the project canvas).

### Persist the login session

Logging in from Railway's datacenter IP is the flakiest step, so keep a session
around instead of logging in every restart. Two ways:

- **Volume (best):** mount a volume and set `STATE_DIR=/data` (as above). The
  session lives in `/data/auth/state.json`, is reused, and self-refreshes.
- **No volume:** run `npm run login` locally (uses your `.env` credentials) — it
  logs in and prints a `SUPERBRU_STATE_B64=…` line. Set that as a Railway env var
  and redeploy; the bot seeds its session from it on boot and never logs in from
  the datacenter IP. Re-run `npm run login` to refresh it when the session
  expires. (Use `npm run login -- --show` for a visible browser if a check
  appears.)

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
