# TFSA Portfolio Intelligence — Project Guide 101

*A single reference doc for understanding the whole project — what it does, how it's built, and how every piece connects. Written for a first-time reader.*

---

## 1. What this project is, in one paragraph

This is a **local, single-user web app** that turns your Wealthsimple TFSA into a live, opinionated investing dashboard. It mirrors your real holdings, cash, and trades in near-real-time (read-only — it can never place an order), then layers analysis on top: portfolio quality scoring, a per-ticker buy/sell/hold rating engine, a news brief, a SPY intraday day-trade signal with a built-in backtester, price/news alerts, and a compounding goal tracker. The guiding idea, stated by the project owner: *"I don't want to be a day trader — I want the power of compounding plus tactical, informed decisions, guided by something like a 24/7 senior Wall Street analyst."* Every feature exists in service of that: **inform, prioritize, and be honest about uncertainty** — not just display numbers.

---

## 2. High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React client components)                              │
│  Dashboard · Holdings · Insights · Activity · News · Rate ·      │
│  SPY Day Trade · Recommendations · Rebalancing · Trends ·        │
│  Watchlist · Journal · Settings                                  │
└───────────────▲───────────────────────────────┬─────────────────┘
                │  fetch() to /api/*             │  EventSource
                │                                 │  /api/stream (SSE)
┌───────────────┴─────────────────────────────────┴───────────────┐
│  Next.js 14 App Router server (single Node process)              │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────────┐    │
│  │ API routes   │  │ Background    │  │ Analysis libraries │    │
│  │ (src/app/api)│  │ poller        │  │ (src/lib, src/     │    │
│  │              │  │ (src/lib/live)│  │  analytics)        │    │
│  └──────┬───────┘  └───────┬───────┘  └──────────┬─────────┘    │
└─────────┼──────────────────┼──────────────────────┼─────────────┘
          │                  │                       │
┌─────────▼──────────────────▼───────────┐  ┌────────▼────────────┐
│  Prisma + SQLite (prisma/portfolio.db)  │  │ External data       │
│  Single source of truth for everything  │  │ Wealthsimple GraphQL │
│  the app knows                          │  │ Yahoo Finance        │
│                                          │  │ Reddit API           │
│                                          │  │ Anthropic (Claude)   │
└──────────────────────────────────────────┘  └──────────────────────┘
```

**It's one process.** There's no separate backend service — Next.js serves the React pages *and* the API routes *and* runs a background poller inside the same server. Everything reads/writes one local SQLite file. This is intentional: it's a single-user local app, not a multi-tenant SaaS, so the simplest architecture that works is the right one.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14 (App Router)** | React pages + API routes + server-only code in one project, one process |
| Language | **TypeScript** end-to-end | Type safety across API responses, DB models, and UI props |
| Database | **SQLite via Prisma ORM** | Zero-config, file-based, perfect for a single local user; `prisma/portfolio.db` |
| Styling | **Tailwind CSS** (utility classes) + inline styles in most components | Fast iteration; no design system overhead for a personal tool |
| Charts | **Recharts** | Area/Bar/Line charts for portfolio value, insights, calibration |
| Validation | **Zod** | Schema-validates every Wealthsimple GraphQL response so API drift fails loud, not silently |
| CSV parsing | **PapaParse** | Fallback data path (Wealthsimple holdings CSV export) |
| Live updates | **Server-Sent Events (SSE)**, no external message broker | One `/api/stream` endpoint pushes events to every open browser tab |
| AI | **Anthropic Claude** (`claude-haiku-4-5` by default) via raw `fetch`, no SDK | News briefs, AI ticker rationale, Reddit sentiment scoring, Morning Brief composition |
| External market data | **Yahoo Finance** (unofficial, keyless endpoints — chart API, RSS, quoteSummary via cookie+crumb, options chain) | No API key needed for 95% of what the app uses |
| Brokerage data | **Unofficial Wealthsimple GraphQL API**, hand-ported to TypeScript | The only way to get live TFSA data — Wealthsimple has no public API |
| Social sentiment | **Reddit API** (OAuth client-credentials) | r/stocks + r/investing + r/wallstreetbets search, feeds the ticker rater |

**No paid infrastructure required.** Every external integration is either free/keyless (Yahoo) or uses free-tier developer credentials the user already had (Reddit, Anthropic). The whole thing runs on `localhost:3000` on the user's own Mac.

---

## 4. Database — the single source of truth

Every model lives in `prisma/schema.prisma`, backed by one SQLite file (`prisma/portfolio.db`). Grouped by purpose:

### Core portfolio
- **`Holding`** — one row per ticker you own. Two kinds of fields live side-by-side on purpose:
  - *Broker-owned* fields (quantity, book value, market price/value, unrealized return) — overwritten every sync, always reflects reality.
  - *User-owned metadata* (bucket, theme, conviction 1–10, horizon, targetPct, thesis) — **never** touched by any sync or import; this is your annotation layer and is the reason the "quality score" and "recommendations" features can exist at all.
- **`PriceHistory`** — per-ticker price snapshots over time (feeds sparklines).
- **`PortfolioSnapshot`** — whole-portfolio value/cash/cost snapshots every ~15 min during market hours → powers the Portfolio Value chart.
- **`WsAccount`** — the synced Wealthsimple TFSA: cash balances (CAD/USD), net liquidation value.
- **`Activity`** — every trade/dividend/deposit/withdrawal pulled from Wealthsimple, deduped by Wealthsimple's own canonical ID. Drives the Activity feed and trade toasts.
- **`ImportLog`** — audit trail of every sync/import attempt (WS API or CSV), including failure reasons.

### Connection & sync plumbing
- **`WsSession`** — the encrypted Wealthsimple OAuth session (see §7). One row.
- **`KV`** — generic key/value store for small pieces of state that don't deserve their own table: the live USD/CAD rate, a "last activity cursor," the cached Morning Brief, poller health timestamps, etc.

### Analysis & intelligence layer
- **`TickerRating`** — every "Rate a Stock" result: composite score, verdict, sub-scores, AI rationale, and the price at rating time (so the scoreboard can grade it later).
- **`DayTradeSignal`** — one row per trading session: the SPY ensemble's direction/confidence, the recommended trade, and (once the session closes) the graded outcome.
- **`NewsItem`** / **`NewsBrief`** — cached headlines and the AI-composed "what matters today" summary.
- **`Alert`** — every alert the poller has raised (big mover, watchlist cross, day-trade signal), deduped per day, with read/unread state.
- **`Goal`** — the user's wealth target (amount, date, monthly contribution, assumed growth rate).

### User-authored content
- **`JournalEntry`** — investment thesis notes; also auto-drafted by the system after every real buy/sell fill.
- **`WatchlistItem`** — pre-TFSA candidates with an optional alert price.
- **`MacroTrend`** — manually curated theme/signal cards (Macro Trends page).
- **`PortfolioSettings`** — misc config (TFSA room, max position size, rebalance trigger).
- **`DiscordTask`** — leftover from an earlier, now-removed Discord-intel feature; unused but harmless.

---

## 5. External integrations — how data actually gets in

This is the part most worth understanding, because almost every feature is a thin analysis layer on top of one of these four data sources.

### 5.1 Wealthsimple (the brokerage mirror)
Wealthsimple has **no public API**. The app talks to their *unofficial* internal GraphQL API — the same one their web app uses — reverse-engineered and hand-ported to TypeScript in `src/lib/ws-api/`:
- `client.ts` — the GraphQL transport: attaches auth headers, retries once on token expiry, maps errors to a typed taxonomy (`WsAuthExpiredError`, `WsRateLimitError`, `WsSchemaError`, `WsNetworkError`).
- `auth.ts`-equivalent logic lives in `client.ts` + `session-store.ts` — login is `email + password + TOTP 2FA` (SMS or authenticator app), yielding an OAuth session that auto-refreshes.
- `session-store.ts` — the session is **AES-256-GCM encrypted** before it ever touches the database (`WsSession.sessionBlob`); the encryption key (`WS_TOKEN_KEY`) lives only in `.env.local`, which is git-ignored.
- `queries.ts` — the actual GraphQL documents (accounts, positions, activity feed, cash balances), copied from the reference implementation.
- `sync.ts` — orchestrates a full sync: pulls positions → upserts `Holding` rows (broker fields only, metadata untouched) → pulls cash → updates `WsAccount` → pulls new activities → inserts `Activity` rows → auto-drafts a `JournalEntry` stub for each new real trade.
- **Read-only by design.** There is no "place order" code path anywhere in the app — a deliberate safety choice given the TFSA day-trading tax risk discussed in §9.
- **Graceful degradation.** If Wealthsimple changes their API and a GraphQL response no longer matches the expected shape (validated by Zod), the app logs it, flips the connection status, and the UI falls back to manual CSV import (`src/lib/ws-csv-parser.ts`, Settings page) rather than crashing.

### 5.2 Yahoo Finance (prices, news, fundamentals, options)
All keyless, no account needed — but used in several different modes depending on what's needed:
- **Live quotes** (`src/lib/yahoo-finance.ts`) — the `/v8/finance/chart` endpoint, called every ~20s during market hours by the poller.
- **News headlines** (`src/lib/news.ts`) — Yahoo's RSS feed per ticker, deduped by link hash.
- **Fundamentals/analyst data** (`src/lib/rating/fundamentals.ts`) — the gated `quoteSummary` endpoint, which requires a **cookie + crumb handshake** (Yahoo's lightweight anti-scraping gate); the app fetches a session cookie, exchanges it for a crumb token, and reuses both for ~30 minutes.
- **Options chains** (`src/lib/daytrade/options.ts`) — same crumb mechanism, used to price the SPY day-trade spread recommendation off real bid/ask quotes.
- **Intraday bars** (`src/lib/daytrade/intraday.ts`) — 1-minute and 5-minute OHLCV bars, normalized to exact America/New_York session time, which the entire day-trade engine is built on.

### 5.3 Reddit (social sentiment)
Application-only OAuth (`REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` from `.env.local`) searches r/stocks + r/investing + r/wallstreetbets for a given ticker (`src/lib/rating/reddit.ts`). Posts are sentiment-scored **by Claude** when API credits are available (it understands sarcasm — "I've made a loss on every AI stock!" correctly scores bearish), falling back to a keyword lexicon otherwise.

### 5.4 Anthropic Claude (the "analyst" voice)
A thin wrapper (`src/lib/claude.ts`) wraps the Messages API directly (no SDK dependency). Used in four places, always with a non-AI fallback so the app never breaks without credits:
1. **Morning Brief composition** — turns raw signals into prioritized, written action cards.
2. **News brief** — "what matters today" summary from the day's headlines.
3. **Reddit sentiment scoring** — as above.
4. **Ticker rating rationale** — a plain-English read on why a stock scored what it did.

---

## 6. The live-update system (why the UI updates without refreshing)

Three pieces work together:

1. **The poller** (`src/lib/live/poller.ts`) — a `globalThis`-scoped singleton (so it survives Next.js dev-server hot reloads and only ever runs once) that runs several independent timer loops:
   - *Price tick* — every ~20s market hours / 15min closed: refresh all holding prices + USD/CAD rate, write price history, take a portfolio snapshot every ~15 min.
   - *WS tick* — every ~45s market hours / 10min closed, only when connected: sync positions + activities; broadcast if anything changed.
   - *Signal tick* — every ~10min market hours: re-run the SPY ensemble and raise an alert if it crosses the trade threshold.
   - Alert rules (big movers ≥4%, watchlist price crossings) run inline inside the price tick.
   - It's started two ways: `instrumentation.ts` boots it when the Next.js server process starts, and `/api/stream` boots it lazily the first time any browser opens the SSE connection (belt-and-suspenders).

2. **The broadcaster** (`src/lib/live/broadcaster.ts`) — an in-process pub/sub. The poller calls `broadcast('prices-updated', …)`; anything subscribed gets it synchronously. No external queue — it's all one Node process.

3. **SSE endpoint + client hook** — `/api/stream/route.ts` opens a long-lived `text/event-stream` response per browser tab, subscribing to the broadcaster and forwarding events with a 25s heartbeat. On the client, `LiveProvider.tsx` owns one `EventSource` and exposes a `useLive(eventType, handler)` hook that any component can call to react to `prices-updated`, `holdings-updated`, `activity`, `ws-status`, `snapshot`, or `alert` events — which is how, e.g., the Dashboard silently re-fetches analytics the moment a price changes, or a toast pops the instant a real trade fills.

---

## 7. Security model (what's protected and how)

- **Wealthsimple credentials** are used in-memory only during login, sent straight to Wealthsimple's servers, and never written to disk or logs.
- **Session tokens** are AES-256-GCM encrypted before hitting SQLite; the encryption key lives only in `.env.local` (git-ignored). Deleting the `WsSession` row (via "Disconnect" in Settings) permanently removes the ability to decrypt anything already stored.
- **Read-only OAuth scope** — the login flow requests Wealthsimple's read-only scope, so even if something went wrong, the token itself cannot authorize a trade.
- **No trade execution path exists in the codebase**, full stop — the safety property doesn't depend on remembering not to call an endpoint that isn't there.
- **API keys** (`ANTHROPIC_API_KEY`, `REDDIT_CLIENT_ID/SECRET`) live only in `.env.local`, which is git-ignored and never logged.
- **Local-only by default** — the dev server binds to `localhost`; nothing is exposed to the network unless explicitly reconfigured.

---

## 8. Feature-by-feature tour

Each feature below names its page, its API route(s), and the library code that does the real work — so you can trace any UI element back to its source.

### Dashboard (`/`)
The home base. Top to bottom: data-health strip (`DataHealth.tsx` / `/api/health`) → **Morning Brief** (see below) → portfolio value chart (`PortfolioValueChart.tsx` / `/api/snapshots`) → **Goal tracker** (see below) → cash balance + recent activity (`CashAndActivity.tsx`) → **Quality Score breakdown** (see below) → allocation charts by bucket/theme → top holdings table.

### Morning Brief — the synthesis layer (`src/lib/brief.ts`, `/api/brief`, `MorningBrief.tsx`)
This is the feature that makes the app feel like an analyst rather than a spreadsheet. It gathers today's biggest movers, fresh news for your holdings, the SPY day-trade signal, rule-based recommendations, and the Quality Score's biggest lever, then either asks Claude to compose 3–5 prioritized action cards from that snapshot, or — if no AI credits are available — composes them deterministically with rule-based logic. Cached per trading day in `KV`, refreshed on demand.

### Holdings (`/holdings`)
Full sortable table of every position with an inline editor for the user-owned metadata (bucket, conviction, thesis, target %, horizon) — this is where you tell the system what you actually believe about each stock, which everything downstream (Quality Score, Recommendations, Rebalancing) reads.

### Insights (`/insights`)
Four Recharts views computed live from current prices: today's movers, winners/losers by return %, weight-vs-target drift, and P&L contribution per holding. Pulls from `/api/movers` and `/api/analytics`.

### Activity (`/activity`)
The synced trade/dividend/deposit feed from Wealthsimple, filterable by type, grouped by day. New fills also trigger a toast (`TradeToaster.tsx`) anywhere in the app via the `activity` SSE event.

### News (`/news`) — `src/lib/news.ts`, `/api/news`
Per-holding headlines from Yahoo RSS, deduplicated, tagged with which tickers they relate to, plus the AI daily brief (or a "click refresh" prompt if no brief exists yet).

### Rate a Stock (`/rate`) — `src/lib/rating/*`, `/api/rate`
Type any ticker, get a **1–10 composite score → BUY/HOLD/SELL**, built from four weighted sub-scores computed independently:
- **Technicals** (`technicals.ts`) — price vs 50/200-day moving average, 1-month momentum, position in the 52-week range. Keyless.
- **Analyst consensus** (`fundamentals.ts`) — Yahoo's aggregated recommendation + mean price target vs current price.
- **Fundamentals** (`fundamentals.ts`) — margins, revenue growth, ROE, P/E.
- **Social/Reddit** (`reddit.ts`) — sentiment across recent posts, Claude-scored with lexicon fallback.

Composite weighting only uses whichever sub-scores actually returned data, so a thinly-covered ticker still gets a reasonable answer instead of an error. An optional AI layer writes a plain-English rationale on top of the numbers. Below the rating tool sits a **scoreboard** (`TickerRating.priceAtRating` vs live price) that grades every past rating RIGHT/WRONG/OPEN — the tool's own track record, shown honestly, misses included.

### SPY Day Trade (`/daytrade`) — `src/lib/daytrade/*`, `/api/daytrade*`
The most heavily fact-checked feature (see §9 for the reasoning behind its design). Live 1-minute SPY bars feed a **six-signal weighted ensemble** (`strategy.ts`):

| Signal | Weight | What it measures |
|---|---|---|
| Confirmed opening-range breakout | 30% | Price closing beyond the 9:30–10:00 range, with volume confirmation |
| VWAP trend | 25% | Price vs volume-weighted average price, and its slope |
| 30-minute momentum | 15% | Recent directional pressure |
| Gap behavior | 10% | Whether an overnight gap is holding or fading |
| Range position | 10% | Where price sits within the opening range (the user's original idea, kept as one input among six) |
| Prior-day levels | 10% | Trading above/below yesterday's high/low |

A chop filter penalizes tight or whipsaw-y sessions. The result is a direction + 0–100 confidence score. If confidence is below 55 or the ensemble is neutral, the tool explicitly recommends **NO TRADE** — the highest-conviction output the tool can give is often "stand aside." When it does have a view, `options.ts` builds a **defined-risk debit vertical spread** (never naked 0DTE options) 3–7 days out, priced off the live options chain, with max risk/profit/breakeven laid out plainly.

Two accountability mechanisms live on this page: a **60-session backtest** comparing the ensemble against the user's original raw idea side by side, and a **calibration tool** (`evaluate.ts`) that replays the ensemble at 10:35 ET across 60 historical sessions and buckets hit-rate by confidence level — so the number is checked against reality rather than trusted blindly.

### Recommendations (`/recommendations`) & Rebalancing (`/rebalancing`) — `src/analytics/scoring.ts`
Rule-based (no AI, no external calls) logic over your own holdings + metadata: concentration limits, over/underweight vs target, low-conviction-and-losing positions. Rebalancing adds a scenario simulator — model a cash injection or trim-only plan before touching anything for real.

### Macro Trends, Watchlist, Journal
Lighter-weight, mostly user-curated pages: theme/signal cards, pre-TFSA candidates with optional price alerts, and free-form investment notes. The Journal auto-receives a thesis-stub entry every time a real buy/sell fill syncs from Wealthsimple — nudging the habit of writing down *why* before it's forgotten.

### Settings — the connection hub
Where you connect/disconnect Wealthsimple (email + password + 2FA), see connection status, trigger a manual sync, and use CSV import as a fallback if the live connection is degraded.

### Alerts & notifications — `src/lib/alerts.ts`, `/api/alerts`, `NotificationBell.tsx`
Three rules run inside the poller independent of any page being open: a holding moving ≥4% in a day, a watchlist alert price being crossed, or the SPY signal crossing the trade threshold. Each is deduped once per ticker per day, pushed live via SSE, and shown as both a toast and a persistent bell icon with unread count in the sidebar — this is what makes the "24/7" framing literally true rather than aspirational.

### Quality Score breakdown — `src/analytics/scoring.ts`, `QualityBreakdown.tsx`
Decomposes the portfolio's 0–100 quality score into its actual components (base, conviction, diversification, concentration penalty), shows how much headroom each has, and names the single biggest lever to improve it — including the specific low-conviction holdings dragging the score down. This directly answers "what's my confidence score and how do I raise it," which was a specific ask during development.

### Goal tracker — `src/lib/goal.ts`, `/api/goal`, `GoalTracker.tsx`
Compounds current portfolio value + monthly contributions at an assumed growth rate, projects forward to a target date, and states plainly whether you're on track — and if not, either the monthly contribution or the required annual return needed to close the gap. This ties the whole tool back to the stated end goal: building real wealth through compounding, not chasing trades.

---

## 9. Design philosophy — the decisions that shape everything

A few explicit choices run through the whole codebase and explain *why* it looks the way it does:

1. **Read-only, always.** The app can see everything in the Wealthsimple account but can never act on it. Trades happen in the Wealthsimple app; this tool only informs the decision.
2. **Metadata never gets overwritten by sync.** Your conviction scores, thesis notes, and targets are annotations *you* own — no CSV import or API sync has ever, or will ever, touch them. This is what makes the "quality score" and "recommendations" trustworthy rather than something that resets every time data refreshes.
3. **Every AI feature has a non-AI fallback.** Anthropic credits running low (which happened during development) degrades output quality, never breaks the app.
4. **Confidence numbers are checked against reality, not just asserted.** The day-trade signal and the ticker ratings both carry scoreboards/calibration tools that grade past calls — a deliberate reaction to the idea that a "senior analyst" tool has to be honest about being wrong sometimes, not just confident-sounding.
5. **The TFSA day-trading tax risk is treated as a real constraint, not a footnote.** Canada's CRA can (and has, per a 2023 court ruling) tax an entire TFSA's gains as business income if trading looks like a business — frequent, speculative, short-hold. The SPY Day Trade feature carries a persistent warning banner and is explicitly framed as decision support for a *separate, non-registered account* — never for execution inside the TFSA the rest of the app mirrors.
6. **Graceful degradation over crashing.** Every external integration (Wealthsimple's unofficial API, Yahoo's gated endpoints, Reddit, Claude) is wrapped so that its failure narrows functionality instead of taking down the app — CSV import as WS fallback, lexicon sentiment as Claude fallback, rule-based briefs as AI-brief fallback.

---

## 10. Running it locally

```bash
cd ws-portfolio
./start.sh          # installs deps, generates Prisma client, seeds DB on first run, starts on :3000
```

First run seeds an initial set of holdings; subsequent runs just start the dev server. Connect your Wealthsimple account from **Settings** to switch from seeded/CSV data to live sync. Required `.env.local` keys: `DATABASE_URL` (auto-set), `ANTHROPIC_API_KEY` (for AI features), `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`/`REDDIT_USER_AGENT` (for social sentiment), `WS_TOKEN_KEY` (auto-generated on first Wealthsimple connect). None of these are required for the app to run — only for the specific features they power.

---

## 11. Where to look next

| I want to understand… | Start here |
|---|---|
| How data flows from Wealthsimple into the DB | `src/lib/ws-api/sync.ts` |
| How the dashboard stays live without refreshing | `src/lib/live/poller.ts` → `broadcaster.ts` → `LiveProvider.tsx` |
| How the Quality Score is calculated | `src/analytics/scoring.ts` |
| How the SPY signal decides direction | `src/lib/daytrade/strategy.ts` |
| How ratings are composed and graded | `src/lib/rating/rate.ts` + `/api/rate` (GET = scoreboard) |
| How the Morning Brief is written | `src/lib/brief.ts` |
| The full data model | `prisma/schema.prisma` |
