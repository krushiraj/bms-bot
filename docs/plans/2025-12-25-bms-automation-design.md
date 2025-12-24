# BMS Ticket Booking Automation - Design Document

## Overview

A self-hosted service to automate BookMyShow ticket booking for movie releases. Supports multiple users via Telegram bot and web UI, with intelligent seat selection and gift card payment.

## Key Decisions

| Aspect | Decision |
|--------|----------|
| Scale | Start with 10-20 users, design for public service later |
| Interfaces | Telegram bot + Web UI (equal functionality) |
| Payment | Stored gift cards (encrypted at rest) |
| Scheduling | Watch mode + scheduled start time for rate limiting |
| Seat selection | Relative positioning (center preference, avoid corners/bottom rows) |
| Failure handling | Sequential fallback through theatre preferences |
| Ticket delivery | Screenshot confirmation, BMS sends actual tickets to user's phone/email |
| Anti-bot | Start simple (stealth browser), add measures as needed |
| Tech stack | Node.js + TypeScript full stack |
| Hosting | Self-hosted with Cloudflare tunnel |
| Monitoring | Simple web dashboard + Telegram alerts |

---

## Section 1: High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACES                          │
├─────────────────────────────┬───────────────────────────────────┤
│      Telegram Bot           │           Web UI (Next.js)        │
│  - Create/manage jobs       │    - Dashboard & job management   │
│  - Add gift cards           │    - Gift card wallet             │
│  - Receive notifications    │    - Booking history              │
└─────────────┬───────────────┴──────────────────┬────────────────┘
              │                                  │
              ▼                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API SERVER (Fastify + TS)                  │
│  - User management          - Job CRUD                          │
│  - Gift card management     - Authentication                    │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
┌─────────────────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│        PostgreSQL           │ │  Redis + BullMQ   │ │   Worker Process  │
│  - Users                    │ │  - Job queue      │ │  - Playwright     │
│  - Jobs                     │ │  - Watch tasks    │ │  - BMS scraping   │
│  - Gift cards (encrypted)   │ │  - Rate limits    │ │  - Seat booking   │
│  - Booking history          │ │                   │ │  - Screenshots    │
└─────────────────────────────┘ └───────────────────┘ └───────────────────┘
                                                              │
                                                              ▼
                                                      ┌───────────────┐
                                                      │ BookMyShow.com│
                                                      └───────────────┘
```

**Key components:**
- **Telegram Bot**: Primary interface for job creation and notifications
- **Web UI**: Dashboard for management, history, gift cards
- **API Server**: Shared backend consumed by both interfaces
- **Job Queue**: BullMQ handles scheduling, retries, watch mode polling
- **Worker**: Playwright browsers that execute the actual bookings

---

## Section 2: Data Models

```typescript
// User - registered via Telegram or Web
interface User {
  id: string;
  telegramId?: string;        // Telegram user ID
  email: string;              // For BMS booking + login
  phone: string;              // For BMS booking
  createdAt: Date;
  isAdmin: boolean;
}

// Gift Card - stored encrypted
interface GiftCard {
  id: string;
  userId: string;
  cardNumber: string;         // Encrypted
  pin: string;                // Encrypted
  balance?: number;           // Last known balance (optional)
  addedAt: Date;
  lastUsedAt?: Date;
}

// Booking Job - the core entity
interface BookingJob {
  id: string;
  userId: string;
  status: 'pending' | 'watching' | 'booking' | 'success' | 'failed';

  // Movie details
  movieName: string;
  city: string;

  // Scheduling
  watchFromDate: Date;        // Start watching from this date
  watchUntilDate: Date;       // Give up after this date

  // Preferences (priority order)
  theatres: string[];         // ["PVR Phoenix", "INOX GVK One"]
  showtimePrefs: {
    dates: string[];          // ["2025-01-10", "2025-01-11"]
    timeRanges: string[];     // ["18:00-22:00", "10:00-12:00"]
  };

  // Seat preferences
  seatPrefs: {
    category: string;         // "Recliner", "Premium", etc.
    count: number;            // Number of seats
    avoidBottomRows: number;  // Skip first N rows
    preferCenter: boolean;    // Prefer center seats
    needAdjacent: boolean;    // Seats must be together
  };

  // Result
  bookingResult?: {
    confirmationId: string;
    theatre: string;
    showtime: string;
    seats: string[];
    amountPaid: number;
    screenshotPath: string;
  };

  createdAt: Date;
  updatedAt: Date;
}
```

**Notes:**
- Gift cards encrypted using AES-256, key from environment variable
- Job status transitions: `pending → watching → booking → success/failed`
- Theatre list is ordered by preference - try first one, fallback to next

---

## Section 3: Job Lifecycle & Booking Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        JOB LIFECYCLE                             │
└──────────────────────────────────────────────────────────────────┘

User creates job
       │
       ▼
   ┌────────┐     watchFromDate reached      ┌──────────┐
   │PENDING │ ─────────────────────────────► │ WATCHING │
   └────────┘                                └────┬─────┘
                                                  │
                          ┌───────────────────────┘
                          │ Poll BMS every 30-60s
                          ▼
                    ┌───────────┐
                    │ Tickets   │───── No ────► Continue polling
                    │ available?│               (until watchUntilDate)
                    └─────┬─────┘
                          │ Yes
                          ▼
                    ┌──────────┐
                    │ BOOKING  │ ◄─── Attempt booking
                    └────┬─────┘
                         │
           ┌─────────────┴─────────────┐
           ▼                           ▼
     ┌─────────┐                 ┌────────┐
     │ SUCCESS │                 │ FAILED │
     └────┬────┘                 └────┬───┘
          │                           │
          ▼                           ▼
   Send screenshot +            Notify user +
   confirmation via             log failure reason
   Telegram
```

**Booking attempt flow (within BOOKING state):**

```
1. Navigate to movie page on BMS
2. Select first preferred theatre
3. Find matching showtime (date + time range)
4. Click to open seat selection
5. Analyze seat layout:
   - Get total rows, seats per row
   - Calculate optimal zone (center, avoid bottom)
   - Find N adjacent available seats with best score
6. Select seats → Proceed to payment
7. Apply gift card(s) to cover amount
8. Fill user details (phone, email)
9. Complete payment
10. Screenshot confirmation page
11. If failure at any step → try next showtime/theatre
```

**Retry logic:**
- Within same theatre: retry 3 times with 2s delay
- Move to next theatre only when current is exhausted
- Total timeout: 5 minutes per booking attempt

---

## Section 4: Seat Selection Algorithm

```typescript
interface SeatLayout {
  rows: Row[];              // All rows in theatre section
  totalRows: number;
  seatsPerRow: number;      // May vary per row
}

interface Row {
  id: string;               // "A", "B", ... "N"
  rowNumber: number;        // 1, 2, ... (from screen)
  seats: Seat[];
}

interface Seat {
  id: string;               // "H12"
  row: string;
  number: number;
  status: 'available' | 'sold' | 'blocked';
  price: number;
}
```

**Scoring algorithm:**

```typescript
function scoreSeat(seat: Seat, layout: SeatLayout, prefs: SeatPrefs): number {
  const { totalRows, seatsPerRow } = layout;

  // Vertical score: prefer middle rows, avoid bottom
  const minRow = prefs.avoidBottomRows;                    // e.g., skip first 4 rows
  const idealRow = minRow + (totalRows - minRow) * 0.4;    // ~40% from allowed start
  const rowDistance = Math.abs(seat.rowNumber - idealRow);
  const verticalScore = 1 - (rowDistance / totalRows);     // 0-1, higher is better

  // Horizontal score: prefer center
  const centerSeat = seatsPerRow / 2;
  const seatDistance = Math.abs(seat.number - centerSeat);
  const horizontalScore = 1 - (seatDistance / (seatsPerRow / 2));

  // Corner penalty: heavily penalize corner seats
  const isCorner = (seat.rowNumber <= 3 || seat.rowNumber >= totalRows - 2)
                && (seat.number <= 2 || seat.number >= seatsPerRow - 1);
  const cornerPenalty = isCorner ? 0.5 : 0;

  // Combined score (weights can be tuned)
  return (verticalScore * 0.5) + (horizontalScore * 0.5) - cornerPenalty;
}

function findBestAdjacentSeats(
  layout: SeatLayout,
  count: number,
  prefs: SeatPrefs
): Seat[] {
  const candidates: { seats: Seat[], avgScore: number }[] = [];

  for (const row of layout.rows) {
    // Find all available consecutive seat groups of required size
    const available = row.seats.filter(s => s.status === 'available');
    const groups = findConsecutiveGroups(available, count);

    for (const group of groups) {
      const avgScore = group.reduce((sum, s) =>
        sum + scoreSeat(s, layout, prefs), 0) / count;
      candidates.push({ seats: group, avgScore });
    }
  }

  // Return group with highest average score
  candidates.sort((a, b) => b.avgScore - a.avgScore);
  return candidates[0]?.seats || [];
}
```

**Example:** Theatre with 15 rows, 20 seats per row, user wants 2 seats:
- Skip rows 1-4 (too close)
- Ideal row: ~row 8-9 (40% into allowed zone)
- Ideal seats: 9-12 (center)
- Algorithm finds best available pair closest to this ideal

---

## Section 5: Telegram Bot Interface

**Commands:**

| Command | Description |
|---------|-------------|
| `/start` | Register and get welcome message |
| `/newjob` | Start job creation wizard |
| `/myjobs` | List all your jobs with status |
| `/cancel <id>` | Cancel a pending/watching job |
| `/addcard` | Add a gift card to wallet |
| `/mycards` | List gift cards (masked) with balances |
| `/removecard <id>` | Remove a gift card |
| `/help` | Show available commands |

**Job creation flow (conversational):**

```
User: /newjob

Bot: What movie do you want to book?

User: Pushpa 2

Bot: Which city?
     [Hyderabad] [Bangalore] [Mumbai] [Other]

User: [Hyderabad]

Bot: Select preferred theatres (in order of preference):
     [Search theatres...]

User: PVR Next Galleria, INOX GVK One

Bot: Which dates? (comma-separated)
     Example: 2025-01-10, 2025-01-11

User: 2025-01-10, 2025-01-11

Bot: Preferred show times?
     [Morning 9-12] [Afternoon 12-17] [Evening 17-21] [Night 21+]

User: [Evening 17-21]

Bot: How many seats?
     [1] [2] [3] [4] [5+]

User: [2]

Bot: Seat category preference?
     [Any] [Recliner] [Premium/Balcony] [Normal]

User: [Recliner]

Bot: Start watching from when?
     [Now] [1 day before release] [2 days before] [Custom date]

User: [2 days before]

Bot: Job created!

     Movie: Pushpa 2
     City: Hyderabad
     Theatres: PVR Next Galleria, INOX GVK One
     Dates: Jan 10-11, 2025 (Evening)
     Seats: 2 Recliner seats (center preferred)
     Watching starts: Jan 8, 2025

     I'll notify you when tickets are available and booked!

     [Cancel Job] [Edit Job]
```

**Notifications:**

```
Started watching for Pushpa 2 tickets...

Tickets detected! Attempting to book...

BOOKED!
Movie: Pushpa 2 - IMAX
Theatre: PVR Next Galleria, Screen 5
Date: Jan 10, 2025 at 7:30 PM
Seats: H11, H12 (Recliner)
Paid: Rs.1,480 via Gift Card
Booking ID: BMSHY12345678

Tickets sent to: +91-98xxx / email@example.com
[Screenshot attached]
```

**Consent flow for suboptimal seats:**

```
Tickets found for Pushpa 2!

WARNING: Only suboptimal seats available:
Row B, Seats 1-2 (Front left corner)
Score: 0.25/1.0

[Book Anyway] [Keep Watching] [Cancel Job]

User: [Keep Watching]

Bot: Continuing to watch for better seats...
     I'll check again in 30 seconds.

(Later, if better seats appear)

Better seats now available!
Row H, Seats 10-11 (Center)
Score: 0.85/1.0

Booking automatically...

BOOKED! ...
```

**Consent logic:**
- If best available score < 0.4 -> ask user for consent
- If score >= 0.4 -> book automatically
- Timeout on consent request: 2 minutes, then keep watching (don't auto-book bad seats)

---

## Section 6: Project Structure

```
bms-bot/
├── src/
│   ├── api/                      # Fastify API server
│   │   ├── server.ts             # Server setup, middleware
│   │   ├── routes/
│   │   │   ├── auth.ts           # Login/register endpoints
│   │   │   ├── jobs.ts           # Job CRUD
│   │   │   ├── cards.ts          # Gift card management
│   │   │   └── webhooks.ts       # Telegram webhook handler
│   │   └── middleware/
│   │       └── auth.ts           # JWT verification
│   │
│   ├── bot/                      # Telegram bot
│   │   ├── index.ts              # Bot setup (grammY)
│   │   ├── commands/
│   │   │   ├── start.ts
│   │   │   ├── newjob.ts         # Job creation wizard
│   │   │   ├── myjobs.ts
│   │   │   └── cards.ts
│   │   ├── conversations/        # Multi-step flows
│   │   │   └── jobWizard.ts
│   │   └── keyboards.ts          # Inline keyboard builders
│   │
│   ├── worker/                   # Background job processor
│   │   ├── index.ts              # BullMQ worker setup
│   │   ├── jobs/
│   │   │   ├── watchJob.ts       # Poll BMS for availability
│   │   │   └── bookingJob.ts     # Execute booking
│   │   └── queues.ts             # Queue definitions
│   │
│   ├── automation/               # Playwright BMS automation
│   │   ├── browser.ts            # Browser setup, stealth
│   │   ├── pages/
│   │   │   ├── BasePage.ts
│   │   │   ├── HomePage.ts       # Movie search
│   │   │   ├── ShowtimesPage.ts  # Theatre/showtime selection
│   │   │   ├── SeatPage.ts       # Seat selection
│   │   │   └── PaymentPage.ts    # Gift card payment
│   │   └── seatSelector.ts       # Scoring algorithm
│   │
│   ├── db/                       # Database layer
│   │   ├── client.ts             # Prisma client
│   │   └── migrations/
│   │
│   ├── services/                 # Business logic
│   │   ├── jobService.ts
│   │   ├── cardService.ts        # Encryption/decryption
│   │   ├── notificationService.ts
│   │   └── userService.ts
│   │
│   ├── utils/
│   │   ├── crypto.ts             # AES encryption helpers
│   │   ├── logger.ts             # Structured logging
│   │   └── config.ts             # Environment config
│   │
│   └── index.ts                  # Main entry point
│
├── web/                          # Next.js frontend (later phase)
│   └── ...
│
├── prisma/
│   └── schema.prisma
│
├── Dockerfile                    # Single container for all services
├── docker-compose.yml            # Local dev: Postgres + Redis
├── railway.toml                  # Railway config
├── package.json
├── tsconfig.json
└── .env.example
```

**Key dependencies:**

```json
{
  "dependencies": {
    "fastify": "^4.x",
    "grammy": "^1.x",
    "bullmq": "^5.x",
    "playwright": "^1.40",
    "@prisma/client": "^5.x",
    "ioredis": "^5.x",
    "zod": "^3.x"
  }
}
```

---

## Section 7: Deployment Strategy

**Design principle:** Containerized with environment-based config. Same image runs anywhere.

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT OPTIONS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Option A: Railway (Start here)                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Railway Project                                         │   │
│  │  ├── Service: bms-bot (API + Bot + Worker)              │   │
│  │  ├── Postgres (Railway add-on)                          │   │
│  │  └── Redis (Railway add-on)                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Option B: VPS / Home Server (If Railway doesn't work)         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Docker Compose                                          │   │
│  │  ├── bms-bot (same container)                           │   │
│  │  ├── postgres:15                                        │   │
│  │  ├── redis:7                                            │   │
│  │  └── cloudflared (tunnel)                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Environment variables (same for both):**

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/bms

# Redis
REDIS_URL=redis://host:6379

# Telegram
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_WEBHOOK_URL=https://your-domain/webhooks/telegram

# Security
ENCRYPTION_KEY=32-byte-hex-key-for-gift-cards
JWT_SECRET=your-jwt-secret

# BMS
BMS_BASE_URL=https://in.bookmyshow.com

# Optional
HEADLESS=true                    # false for debugging
SCREENSHOT_DIR=/app/screenshots  # or S3 bucket URL
```

**Dockerfile (supports both modes):**

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

# Install browser
RUN npx playwright install chromium

CMD ["node", "dist/index.js"]
```

**Railway-specific (`railway.toml`):**

```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/health"
restartPolicyType = "on_failure"
```

**Migration path Railway to VPS:**
1. Export Postgres dump from Railway
2. Spin up VPS with docker-compose
3. Import database
4. Update DNS/webhook URLs
5. Done - same code, different host

---

## Section 8: Security Considerations

**Sensitive data we handle:**
- Gift card numbers + PINs (payment credentials)
- User phone numbers and emails
- Telegram user IDs
- Booking confirmations

**Encryption strategy:**

```typescript
// Gift cards encrypted at rest using AES-256-GCM
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes

function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decrypt(encrypted: string): string {
  const [ivHex, authTagHex, ciphertext] = encrypted.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

**Access control:**
- Users can only see/manage their own jobs and cards
- Admin flag for future admin dashboard
- Telegram ID verified on each request
- JWT tokens for web UI (short expiry, refresh tokens)

**Rate limiting:**
- Per-user job limits (e.g., max 5 active jobs)
- API rate limiting (prevent abuse)
- Gift card addition limits (prevent testing stolen cards)

**Logging policy:**
- Never log gift card numbers/PINs
- Mask phone numbers in logs (show last 4 digits)
- Log job events for debugging (without sensitive data)

**Screenshot handling:**
- Screenshots may contain booking details
- Store with user-specific paths
- Auto-delete after 7 days
- If using S3: private bucket, signed URLs

---

## Section 9: Implementation Phases

**Phase 1: Foundation (MVP)**
- Project setup: TypeScript, Prisma, Docker
- Database schema and migrations
- Basic Telegram bot with `/start`, `/help`
- User registration via Telegram
- Gift card CRUD (add, list, remove) with encryption
- Deploy to Railway

**Phase 2: BMS Automation Core**
- Playwright setup with stealth config
- Page objects for BMS flow (Home -> Showtimes -> Seats -> Payment)
- Seat layout parser and scoring algorithm
- Single manual booking test (no queue yet)
- Screenshot capture

**Phase 3: Job System**
- BullMQ queue setup
- Watch job: poll BMS for ticket availability
- Booking job: execute full booking flow
- Job status updates and Telegram notifications
- Retry logic and fallback through theatres

**Phase 4: Full Telegram Bot**
- `/newjob` wizard (conversational flow)
- `/myjobs`, `/cancel` commands
- Consent flow for suboptimal seats
- Success/failure notifications with screenshots

**Phase 5: Polish & Scale**
- Web UI dashboard (Next.js)
- Anti-bot measures if needed (proxies, captcha solving)
- Admin controls
- VPS migration if Railway hits limits
- Monetization (donations/subscriptions)
