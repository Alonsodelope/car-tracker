# BMW M2 Market Tracker

A personal, desktop-first web dashboard that tracks BMW M2 used car listings from Cars.com and Autotrader. Runs a daily automated scrape, stores historical data, and shows market trends, price movements, inventory changes, and deal quality.

**Tracked:** BMW M2 · 2023–2025 · Used · ≤$60,000

---

## Features

- **Daily auto-sync** at 8:00 AM via a background cron process
- **Market Overview** — active count, new/removed today, avg/median price & mileage
- **Price Trends** — charts for price over time, inventory count, daily activity, price vs mileage scatter
- **Listings Table** — sortable/filterable table with deal badges
- **Listing Detail** — price history chart, comparable listings, source link
- **Fair Market Value** — classifies each listing as Good Deal / Fair / Overpriced
- **Admin Page** — manual sync trigger, source status, sync history
- **30-day seed data** — dashboard works immediately before live collection runs

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| [Node.js 20+](https://nodejs.org) | Runtime |
| [pnpm](https://pnpm.io) | Package manager |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | PostgreSQL |

### Install Node.js (macOS)

```bash
# Option A: Homebrew
brew install node

# Option B: Official installer
# Download from https://nodejs.org

# Option C: nvm (version manager, recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20
```

### Install pnpm

```bash
npm install -g pnpm
# or
brew install pnpm
```

---

## Setup

### 1. Start the database

```bash
docker compose up -d
```

This starts PostgreSQL on port 5432 and pgAdmin on port 5050.

### 2. Install dependencies

```bash
cd bmw-m2-tracker
pnpm install
```

### 3. Install Playwright browsers

```bash
pnpm exec playwright install chromium
```

### 4. Set up environment

The `.env.local` file is already created with default local values:

```env
DATABASE_URL=postgresql://tracker:tracker_pass@localhost:5432/bmw_m2_tracker
NEXT_PUBLIC_APP_URL=http://localhost:3000
SYNC_SECRET_TOKEN=dev-secret-token
```

### 5. Run database migrations

```bash
pnpm db:migrate
```

### 6. Seed mock data (30 days of realistic BMW M2 data)

```bash
pnpm seed
```

### 7. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — the dashboard loads with seeded data immediately.

---

## Running the cron scheduler

The cron process runs separately from Next.js. Open a second terminal:

```bash
pnpm cron
```

This starts a background process that triggers the sync every morning at 8:00 AM.

To run a sync immediately:

```bash
pnpm cron -- --now
# or
pnpm sync
```

---

## Manual sync via API

```bash
# Trigger sync from the admin page at http://localhost:3000/admin
# or via curl:
curl -X POST http://localhost:3000/api/sync \
  -H "x-sync-token: dev-secret-token"
```

---

## Database GUI

pgAdmin is available at [http://localhost:5050](http://localhost:5050)

- Email: `admin@tracker.local`
- Password: `admin`
- Server: host `postgres`, port `5432`, user `tracker`, pass `tracker_pass`, db `bmw_m2_tracker`

Or use Drizzle Studio:

```bash
pnpm db:studio
```

---

## Project Structure

```
bmw-m2-tracker/
├── src/
│   ├── app/                    # Next.js App Router pages + API routes
│   │   ├── page.tsx            # Dashboard
│   │   ├── listings/[id]/      # Listing detail
│   │   ├── admin/              # Admin page
│   │   └── api/                # REST API routes
│   ├── components/
│   │   ├── dashboard/          # MarketOverview, PriceTrends, DailySummary
│   │   ├── listings/           # ListingsTable, DealBadge, PriceHistoryChart
│   │   └── ui/                 # Card, Badge, Button components
│   ├── lib/
│   │   ├── db/                 # Drizzle schema, client, queries
│   │   ├── collectors/         # Cars.com + Autotrader scrapers
│   │   ├── sync/               # Daily sync diff logic
│   │   └── market/             # Fair value estimation
│   └── types/                  # Shared TypeScript types
├── drizzle/migrations/         # Auto-generated SQL migrations
├── scripts/
│   ├── seed.ts                 # Seed 30 days mock data
│   └── run-sync.ts             # One-shot sync runner
├── cron/
│   └── scheduler.ts            # node-cron 8AM daily job
├── docker-compose.yml
└── drizzle.config.ts
```

---

## Changing the search filters

All search filters are defined in one place:

**[src/lib/collectors/base.ts](src/lib/collectors/base.ts)**

```typescript
export const SEARCH_CONFIG = {
  make: "bmw",
  model: "m2",
  yearMin: 2023,
  yearMax: 2025,
  maxPrice: 60000,
  stockType: "used",
} as const;
```

Change these values and restart the app to track a different car.

---

## How data collection works

Each source has a modular adapter (`src/lib/collectors/`):

1. **Cars.com** — Playwright chromium, intercepts JSON API responses, falls back to DOM extraction. Paginates through all results.
2. **Autotrader** — Playwright chromium, intercepts GraphQL responses, falls back to DOM extraction. Paginates through all results.

Both collectors use 2–3 second delays between pages with random jitter to be respectful of server resources.

---

## Fair market value algorithm

For each active listing:
1. Find comparables: same year ±1, mileage ±20,000 miles
2. If ≥3 comparables exist, use their median price
3. Otherwise use the median of all active listings

Classification:
- **Good Deal** — price is ≥8% below fair value
- **Fair** — price is within ±8% of fair value
- **Overpriced** — price is >8% above fair value

---

## Auto-start on login (macOS)

To have the cron scheduler start automatically when you log in, create a launchd plist:

```bash
# Edit the path in the plist template below, then:
cp bmw-m2-tracker-cron.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/bmw-m2-tracker-cron.plist
```

Create `bmw-m2-tracker-cron.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bmwm2tracker.cron</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/pnpm</string>
        <string>--dir</string>
        <string>/YOUR/PATH/TO/bmw-m2-tracker</string>
        <string>cron</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/bmw-m2-tracker-cron.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/bmw-m2-tracker-cron.error.log</string>
</dict>
</plist>
```

Replace `/YOUR/PATH/TO/bmw-m2-tracker` with the actual path.
