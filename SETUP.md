# TFSA Portfolio Intelligence — Setup Guide

## What you're getting
A full local web app that runs on your Mac at `http://localhost:3000`.  
**Live sync with your Wealthsimple TFSA** — holdings, cash, and buy/sell activity update automatically.  
Live prices from Yahoo Finance (no API key needed).  
Wealthsimple CSV import kept as a fallback.

## Connecting your Wealthsimple account (live sync)
1. Start the app and open **Settings**.
2. In the **Wealthsimple connection** card, enter your Wealthsimple email + password and click **Connect**.
3. Enter the **2FA code** from your authenticator app when prompted.
4. Done — your TFSA holdings, cash, and trade history sync immediately, and the dashboard updates live from then on (new buys/sells pop a toast and land in the **Activity** feed within ~45s while the app is open).

Your login is sent only to Wealthsimple. The app stores an **encrypted session token** locally (never your password); click **Disconnect** anytime to delete it. This uses Wealthsimple's private API in **read-only** mode — the dashboard can never place trades.

**Security:** keep the app on `localhost` (the default). Do not launch it with `-H 0.0.0.0`, which would expose your portfolio and session on your network.

If Wealthsimple ever changes their API and live sync degrades, the app automatically falls back to CSV import (below) and shows a banner — your data is never lost.

---

## Prerequisites (one-time, ~5 min)

### 1. Install Node.js
Go to **https://nodejs.org** → download the **LTS** version → install it.

To verify: open Terminal and run:
```
node --version
```
Should print something like `v20.x.x`.

### 2. Move the folder
Move the `ws-portfolio` folder anywhere you like — your Desktop, Documents, etc.

---

## First launch

Open **Terminal** (Cmd + Space → type "Terminal").

```bash
# Navigate to the folder (adjust path if you moved it)
cd ~/Desktop/ws-portfolio

# Make start script executable (one time only)
chmod +x start.sh

# Launch
./start.sh
```

The first launch takes ~60 seconds (installing packages, creating DB, seeding your data).  
After that it's instant.

Open your browser to: **http://localhost:3000**

---

## Daily use

```bash
cd ~/Desktop/ws-portfolio
./start.sh
```

Or just double-click `start.sh` from Finder (right-click → Open).

---

## Keeping your data current

### Option A — Refresh live prices
Click **↻ Refresh prices** on the Dashboard, or go to **Settings → Refresh all prices now**.  
This hits Yahoo Finance and updates all 14 prices. Free, no login.

### Option B — Import fresh holdings from Wealthsimple
When you make trades or add/remove positions:

1. Open Wealthsimple on desktop
2. Go to your TFSA → Holdings tab
3. Click **Export** (download icon, top right)
4. Choose **Holdings report** → downloads a CSV
5. In the app, go to **Settings** → drop the CSV into the import zone
6. Done — quantities, book values, and prices all sync instantly

Your thesis notes, conviction scores, and targets are preserved on import.

---

## Pages

| Page | What it does |
|------|-------------|
| Dashboard | Portfolio overview, metrics, allocation charts, top holdings |
| Holdings | Full table of all positions, sortable, click to edit metadata |
| Recommendations | Automated rule-based actions (ADD/TRIM/SELL/REPLACE/HOLD) |
| Rebalancing | Scenario simulator — model trades before executing |
| Macro Trends | Theme signals (Bullish/Neutral/Bearish) with drivers + risks |
| Watchlist | Tickers you're monitoring before adding to TFSA |
| Journal | Investment thesis notes, trade rationale, decisions log |
| Settings | CSV import, price refresh, how-to guides |

---

## Editing holding metadata

Click any row in the **Holdings** page to expand an edit panel where you can update:
- Bucket (Core / Tactical / Speculative)
- Conviction score (1–10)
- Target weight (%)
- Time horizon
- Theme
- Investment thesis

These are never overwritten by CSV imports — they're your annotations.

---

## Stopping the app

Press `Ctrl + C` in Terminal.

---

## Troubleshooting

**App won't start — "command not found: node"**  
Install Node.js from https://nodejs.org

**Port 3000 already in use**  
Another app is on that port. Run: `npm run dev -- --port 3001` and open http://localhost:3001

**Prices showing as 0 or not updating**  
Yahoo Finance occasionally rate-limits. Wait 5 minutes and try again.

**Import failed**  
Make sure you exported the "Holdings report" CSV from Wealthsimple (not an activity/transaction CSV).

**Want to reset everything**  
Delete `prisma/portfolio.db` and run `./start.sh` again — it will re-seed from your original data.

---

## Tech stack (for reference)
- **Next.js 14** — full-stack React framework
- **Prisma + SQLite** — local database, zero config
- **Tailwind CSS** — styling
- **Yahoo Finance v8 API** — free price data, no key needed
- **TypeScript** — end-to-end type safety
