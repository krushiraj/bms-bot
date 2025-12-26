# Phase 2: BMS Automation Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Playwright-based automation layer that can navigate BookMyShow, select seats using our scoring algorithm, and complete bookings with gift cards.

**Architecture:** Page Object Model with BasePage providing common utilities. Each BMS page (Home, Showtimes, Seats, Payment) gets its own class. Seat selection uses a scoring algorithm that prefers center seats and avoids front rows. Browser manager handles stealth configuration.

**Tech Stack:** Playwright, playwright-extra (stealth), TypeScript

---

## Task 1: Browser Manager with Stealth Configuration

**Files:**
- Create: `src/automation/browser.ts`
- Create: `src/automation/browser.test.ts`

**Step 1: Install playwright-extra and stealth plugin**

```bash
yarn add playwright-extra puppeteer-extra-plugin-stealth
```

**Step 2: Create src/automation/browser.ts**

```typescript
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export interface BrowserOptions {
  headless?: boolean;
  slowMo?: number;
  viewport?: { width: number; height: number };
}

const DEFAULT_OPTIONS: BrowserOptions = {
  headless: true,
  slowMo: 50,
  viewport: { width: 1920, height: 1080 },
};

let browserInstance: Browser | null = null;

export async function launchBrowser(
  options: BrowserOptions = {}
): Promise<Browser> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Check HEADLESS env var
  if (process.env.HEADLESS === 'false') {
    opts.headless = false;
  }

  logger.info('Launching browser', { headless: opts.headless });

  browserInstance = await chromium.launch({
    headless: opts.headless,
    slowMo: opts.slowMo,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
  });

  return browserInstance;
}

export async function createContext(
  browser: Browser,
  options: BrowserOptions = {}
): Promise<BrowserContext> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const context = await browser.newContext({
    viewport: opts.viewport,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    geolocation: { latitude: 17.385, longitude: 78.4867 }, // Hyderabad
    permissions: ['geolocation'],
  });

  // Add stealth scripts to evade detection
  await context.addInitScript(() => {
    // Override webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Override plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-IN', 'en-US', 'en'],
    });
  });

  return context;
}

export async function createPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();

  // Set default timeouts
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(30000);

  return page;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    logger.info('Browser closed');
  }
}

export async function takeScreenshot(
  page: Page,
  name: string
): Promise<string> {
  const timestamp = Date.now();
  const path = `screenshots/${name}-${timestamp}.png`;
  await page.screenshot({ path, fullPage: true });
  logger.info('Screenshot saved', { path });
  return path;
}
```

**Step 3: Create basic test**

Create `src/automation/browser.test.ts`:

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { launchBrowser, createContext, createPage, closeBrowser } from './browser.js';

describe('browser', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it('should launch browser and create page', async () => {
    const browser = await launchBrowser({ headless: true });
    expect(browser).toBeDefined();

    const context = await createContext(browser);
    expect(context).toBeDefined();

    const page = await createPage(context);
    expect(page).toBeDefined();

    await page.goto('https://example.com');
    const title = await page.title();
    expect(title).toContain('Example');

    await context.close();
  }, 30000);
});
```

**Step 4: Create screenshots directory**

```bash
mkdir -p screenshots
echo "screenshots/*.png" >> .gitignore
```

**Step 5: Run tests**

```bash
yarn test src/automation/browser.test.ts
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add browser manager with stealth configuration"
```

---

## Task 2: Base Page Class

**Files:**
- Create: `src/automation/pages/BasePage.ts`

**Step 1: Create src/automation/pages/BasePage.ts**

```typescript
import { Page, Locator } from 'playwright';
import { logger } from '../../utils/logger.js';
import { takeScreenshot } from '../browser.js';

export abstract class BasePage {
  protected page: Page;
  protected name: string;

  constructor(page: Page, name: string) {
    this.page = page;
    this.name = name;
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    logger.debug(`${this.name} loaded`);
  }

  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async click(selector: string, options?: { timeout?: number }): Promise<void> {
    const timeout = options?.timeout ?? 10000;
    await this.page.click(selector, { timeout });
    logger.debug(`Clicked: ${selector}`);
  }

  async clickAndWait(selector: string): Promise<void> {
    await Promise.all([
      this.page.waitForLoadState('domcontentloaded'),
      this.page.click(selector),
    ]);
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
    logger.debug(`Filled: ${selector}`);
  }

  async getText(selector: string): Promise<string> {
    const element = await this.page.waitForSelector(selector);
    return (await element?.textContent()) ?? '';
  }

  async isVisible(selector: string, timeout = 5000): Promise<boolean> {
    try {
      await this.page.waitForSelector(selector, { state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  async waitForSelector(
    selector: string,
    options?: { timeout?: number; state?: 'visible' | 'hidden' }
  ): Promise<Locator> {
    const timeout = options?.timeout ?? 10000;
    const state = options?.state ?? 'visible';
    await this.page.waitForSelector(selector, { timeout, state });
    return this.page.locator(selector);
  }

  async screenshot(suffix = ''): Promise<string> {
    const name = `${this.name}${suffix ? `-${suffix}` : ''}`;
    return takeScreenshot(this.page, name);
  }

  async scrollToBottom(): Promise<void> {
    await this.page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
  }

  async scrollToElement(selector: string): Promise<void> {
    await this.page.locator(selector).scrollIntoViewIfNeeded();
  }

  async delay(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  getPage(): Page {
    return this.page;
  }
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add BasePage class with common utilities"
```

---

## Task 3: Seat Selection Algorithm

**Files:**
- Create: `src/automation/seatSelector.ts`
- Create: `src/automation/seatSelector.test.ts`

**Step 1: Create types and interfaces**

Create `src/automation/seatSelector.ts`:

```typescript
export interface Seat {
  id: string;           // e.g., "H-12"
  row: string;          // e.g., "H"
  number: number;       // e.g., 12
  status: 'available' | 'sold' | 'blocked';
  price: number;
  category?: string;    // e.g., "Recliner", "Premium"
}

export interface Row {
  id: string;           // e.g., "H"
  rowNumber: number;    // 1-indexed from screen
  seats: Seat[];
}

export interface SeatLayout {
  rows: Row[];
  totalRows: number;
  maxSeatsPerRow: number;
  categories: string[];
}

export interface SeatPrefs {
  count: number;
  category?: string;
  avoidBottomRows: number;    // Skip first N rows
  preferCenter: boolean;
  needAdjacent: boolean;
}

export interface SeatScore {
  seat: Seat;
  score: number;
}

export interface SeatGroup {
  seats: Seat[];
  avgScore: number;
}

/**
 * Score a single seat based on position preferences
 * Returns 0-1 (higher is better)
 */
export function scoreSeat(
  seat: Seat,
  layout: SeatLayout,
  prefs: SeatPrefs
): number {
  const { totalRows, maxSeatsPerRow } = layout;
  const row = layout.rows.find((r) => r.id === seat.row);
  if (!row) return 0;

  // Find row number (1-indexed from screen)
  const rowNumber = row.rowNumber;

  // Vertical score: prefer middle-back rows, avoid front
  const minRow = prefs.avoidBottomRows;
  const usableRows = totalRows - minRow;

  if (rowNumber <= minRow) {
    // Penalize front rows heavily
    return 0.1;
  }

  // Ideal row is about 40% into the usable zone
  const idealRow = minRow + usableRows * 0.4;
  const rowDistance = Math.abs(rowNumber - idealRow);
  const verticalScore = Math.max(0, 1 - rowDistance / usableRows);

  // Horizontal score: prefer center
  const centerSeat = maxSeatsPerRow / 2;
  const seatDistance = Math.abs(seat.number - centerSeat);
  const horizontalScore = Math.max(0, 1 - seatDistance / (maxSeatsPerRow / 2));

  // Corner penalty
  const isCorner =
    (rowNumber <= minRow + 2 || rowNumber >= totalRows - 1) &&
    (seat.number <= 2 || seat.number >= maxSeatsPerRow - 1);
  const cornerPenalty = isCorner ? 0.3 : 0;

  // Combined score (equal weight to vertical and horizontal)
  const score = (verticalScore * 0.5 + horizontalScore * 0.5) - cornerPenalty;

  return Math.max(0, Math.min(1, score));
}

/**
 * Find consecutive available seats in a row
 */
export function findConsecutiveGroups(
  seats: Seat[],
  count: number
): Seat[][] {
  const groups: Seat[][] = [];
  const available = seats
    .filter((s) => s.status === 'available')
    .sort((a, b) => a.number - b.number);

  for (let i = 0; i <= available.length - count; i++) {
    const group = available.slice(i, i + count);

    // Check if seats are actually consecutive
    let isConsecutive = true;
    for (let j = 1; j < group.length; j++) {
      if (group[j]!.number !== group[j - 1]!.number + 1) {
        isConsecutive = false;
        break;
      }
    }

    if (isConsecutive) {
      groups.push(group);
    }
  }

  return groups;
}

/**
 * Find the best group of adjacent seats
 */
export function findBestAdjacentSeats(
  layout: SeatLayout,
  prefs: SeatPrefs
): SeatGroup | null {
  const candidates: SeatGroup[] = [];

  for (const row of layout.rows) {
    // Filter by category if specified
    let seats = row.seats;
    if (prefs.category) {
      seats = seats.filter((s) => s.category === prefs.category);
    }

    const groups = findConsecutiveGroups(seats, prefs.count);

    for (const group of groups) {
      const scores = group.map((seat) => scoreSeat(seat, layout, prefs));
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      candidates.push({ seats: group, avgScore });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Sort by score descending
  candidates.sort((a, b) => b.avgScore - a.avgScore);

  return candidates[0] ?? null;
}

/**
 * Check if seat score meets minimum threshold
 */
export function meetsMinimumScore(
  group: SeatGroup,
  minScore = 0.4
): boolean {
  return group.avgScore >= minScore;
}
```

**Step 2: Write tests**

Create `src/automation/seatSelector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  scoreSeat,
  findConsecutiveGroups,
  findBestAdjacentSeats,
  meetsMinimumScore,
  SeatLayout,
  SeatPrefs,
  Seat,
} from './seatSelector.js';

// Helper to create a seat
function createSeat(row: string, number: number, status: 'available' | 'sold' = 'available'): Seat {
  return {
    id: `${row}-${number}`,
    row,
    number,
    status,
    price: 200,
  };
}

// Helper to create a row
function createRow(id: string, rowNumber: number, seatCount: number, soldSeats: number[] = []) {
  const seats: Seat[] = [];
  for (let i = 1; i <= seatCount; i++) {
    seats.push(createSeat(id, i, soldSeats.includes(i) ? 'sold' : 'available'));
  }
  return { id, rowNumber, seats };
}

describe('seatSelector', () => {
  describe('scoreSeat', () => {
    const layout: SeatLayout = {
      rows: [
        createRow('A', 1, 20),
        createRow('B', 2, 20),
        createRow('C', 3, 20),
        createRow('D', 4, 20),
        createRow('E', 5, 20),
        createRow('F', 6, 20),
        createRow('G', 7, 20),
        createRow('H', 8, 20),
        createRow('I', 9, 20),
        createRow('J', 10, 20),
      ],
      totalRows: 10,
      maxSeatsPerRow: 20,
      categories: ['Standard'],
    };

    const prefs: SeatPrefs = {
      count: 2,
      avoidBottomRows: 3,
      preferCenter: true,
      needAdjacent: true,
    };

    it('should score center seats higher than edge seats', () => {
      const centerSeat = createSeat('H', 10);
      const edgeSeat = createSeat('H', 1);

      const centerScore = scoreSeat(centerSeat, layout, prefs);
      const edgeScore = scoreSeat(edgeSeat, layout, prefs);

      expect(centerScore).toBeGreaterThan(edgeScore);
    });

    it('should penalize front rows', () => {
      const frontSeat = createSeat('A', 10);
      const backSeat = createSeat('H', 10);

      const frontScore = scoreSeat(frontSeat, layout, prefs);
      const backScore = scoreSeat(backSeat, layout, prefs);

      expect(backScore).toBeGreaterThan(frontScore);
      expect(frontScore).toBeLessThan(0.2); // Heavily penalized
    });

    it('should return score between 0 and 1', () => {
      for (const row of layout.rows) {
        for (const seat of row.seats) {
          const score = scoreSeat(seat, layout, prefs);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('findConsecutiveGroups', () => {
    it('should find consecutive available seats', () => {
      const seats = [
        createSeat('H', 1),
        createSeat('H', 2),
        createSeat('H', 3),
        createSeat('H', 4),
        createSeat('H', 5),
      ];

      const groups = findConsecutiveGroups(seats, 2);
      expect(groups.length).toBe(4); // [1,2], [2,3], [3,4], [4,5]
    });

    it('should skip sold seats', () => {
      const seats = [
        createSeat('H', 1),
        createSeat('H', 2, 'sold'),
        createSeat('H', 3),
        createSeat('H', 4),
      ];

      const groups = findConsecutiveGroups(seats, 2);
      expect(groups.length).toBe(1); // Only [3,4]
      expect(groups[0]![0]!.number).toBe(3);
    });

    it('should return empty array if not enough consecutive seats', () => {
      const seats = [
        createSeat('H', 1),
        createSeat('H', 3), // Gap at 2
        createSeat('H', 5), // Gap at 4
      ];

      const groups = findConsecutiveGroups(seats, 2);
      expect(groups.length).toBe(0);
    });
  });

  describe('findBestAdjacentSeats', () => {
    it('should find best seats in center of theatre', () => {
      const layout: SeatLayout = {
        rows: [
          createRow('A', 1, 10),
          createRow('B', 2, 10),
          createRow('C', 3, 10),
          createRow('D', 4, 10),
          createRow('E', 5, 10),
          createRow('F', 6, 10),
          createRow('G', 7, 10),
          createRow('H', 8, 10),
        ],
        totalRows: 8,
        maxSeatsPerRow: 10,
        categories: ['Standard'],
      };

      const prefs: SeatPrefs = {
        count: 2,
        avoidBottomRows: 2,
        preferCenter: true,
        needAdjacent: true,
      };

      const result = findBestAdjacentSeats(layout, prefs);

      expect(result).not.toBeNull();
      expect(result!.seats.length).toBe(2);

      // Best seats should be in middle rows (D-F) and center columns (4-7)
      const seat = result!.seats[0]!;
      expect(['D', 'E', 'F']).toContain(seat.row);
      expect(seat.number).toBeGreaterThanOrEqual(4);
      expect(seat.number).toBeLessThanOrEqual(7);
    });

    it('should return null if no seats available', () => {
      const layout: SeatLayout = {
        rows: [createRow('A', 1, 5, [1, 2, 3, 4, 5])], // All sold
        totalRows: 1,
        maxSeatsPerRow: 5,
        categories: ['Standard'],
      };

      const prefs: SeatPrefs = {
        count: 2,
        avoidBottomRows: 0,
        preferCenter: true,
        needAdjacent: true,
      };

      const result = findBestAdjacentSeats(layout, prefs);
      expect(result).toBeNull();
    });
  });

  describe('meetsMinimumScore', () => {
    it('should return true for good seats', () => {
      const group = {
        seats: [createSeat('H', 5), createSeat('H', 6)],
        avgScore: 0.75,
      };
      expect(meetsMinimumScore(group, 0.4)).toBe(true);
    });

    it('should return false for poor seats', () => {
      const group = {
        seats: [createSeat('A', 1), createSeat('A', 2)],
        avgScore: 0.2,
      };
      expect(meetsMinimumScore(group, 0.4)).toBe(false);
    });
  });
});
```

**Step 3: Run tests**

```bash
yarn test src/automation/seatSelector.test.ts
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add seat selection algorithm with scoring"
```

---

## Task 4: BMS Home Page (Movie Search)

**Files:**
- Create: `src/automation/pages/HomePage.ts`

**Step 1: Create src/automation/pages/HomePage.ts**

```typescript
import { Page } from 'playwright';
import { BasePage } from './BasePage.js';
import { logger } from '../../utils/logger.js';

export class HomePage extends BasePage {
  private baseUrl = 'https://in.bookmyshow.com';

  // Selectors
  private selectors = {
    searchInput: 'input[placeholder*="Search"]',
    searchResults: '.sc-7o7nez-0', // Movie search results container
    movieCard: '[data-testid="movie-card"]',
    movieTitle: '.bwgNvN', // Movie title in search
    citySelector: '[data-testid="city-selector"]',
    currentCity: '.sc-fihHvN',
  };

  constructor(page: Page) {
    super(page, 'HomePage');
  }

  async navigate(city = 'hyderabad'): Promise<void> {
    const url = `${this.baseUrl}/explore/home/${city}`;
    logger.info('Navigating to BMS', { url });
    await this.page.goto(url);
    await this.waitForLoad();
  }

  async searchMovie(movieName: string): Promise<void> {
    logger.info('Searching for movie', { movieName });

    // Click search or find search input
    const searchInput = this.page.locator(this.selectors.searchInput).first();
    await searchInput.waitFor({ state: 'visible', timeout: 10000 });
    await searchInput.click();
    await searchInput.fill(movieName);

    // Wait for search results
    await this.delay(1000); // Allow search to process
  }

  async selectMovieFromSearch(movieName: string): Promise<boolean> {
    logger.info('Selecting movie from search results', { movieName });

    // Look for movie in results
    const movieLinks = this.page.locator('a').filter({ hasText: movieName });

    const count = await movieLinks.count();
    if (count === 0) {
      logger.warn('Movie not found in search results', { movieName });
      return false;
    }

    // Click the first matching result
    await movieLinks.first().click();
    await this.waitForLoad();

    logger.info('Movie selected', { movieName });
    return true;
  }

  async navigateToMovie(movieSlug: string, city = 'hyderabad'): Promise<void> {
    // Direct navigation to movie page
    const url = `${this.baseUrl}/explore/movies/${movieSlug}/${city}`;
    logger.info('Navigating directly to movie', { url });
    await this.page.goto(url);
    await this.waitForLoad();
  }

  async getCurrentCity(): Promise<string> {
    try {
      const cityElement = this.page.locator(this.selectors.currentCity).first();
      return await cityElement.textContent() ?? '';
    } catch {
      return '';
    }
  }

  async isMoviePageLoaded(): Promise<boolean> {
    // Check if we're on a movie details page
    const url = this.page.url();
    return url.includes('/movies/') || url.includes('/events/');
  }
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add HomePage for movie search"
```

---

## Task 5: BMS Showtimes Page

**Files:**
- Create: `src/automation/pages/ShowtimesPage.ts`

**Step 1: Create src/automation/pages/ShowtimesPage.ts**

```typescript
import { Page } from 'playwright';
import { BasePage } from './BasePage.js';
import { logger } from '../../utils/logger.js';

export interface Showtime {
  time: string;
  format: string;      // e.g., "2D", "IMAX"
  available: boolean;
  price?: string;
  element: any;        // Playwright Locator for clicking
}

export interface Theatre {
  name: string;
  showtimes: Showtime[];
}

export class ShowtimesPage extends BasePage {
  private selectors = {
    dateSelector: '[data-testid="date-selector"]',
    dateItem: '.date-item',
    theatreCard: '[data-testid="theatre-card"]',
    theatreName: '.theatre-name',
    showtime: '[data-testid="showtime-pill"]',
    bookButton: 'button:has-text("Book")',
    filterFormat: '[data-testid="format-filter"]',
  };

  constructor(page: Page) {
    super(page, 'ShowtimesPage');
  }

  async waitForShowtimes(): Promise<boolean> {
    try {
      // Wait for theatre list to load
      await this.page.waitForSelector('.venue-list, [data-testid="venue-list"]', {
        timeout: 15000,
      });
      return true;
    } catch {
      logger.warn('No showtimes found');
      return false;
    }
  }

  async selectDate(date: string): Promise<void> {
    // date format: "YYYY-MM-DD" or relative like "today", "tomorrow"
    logger.info('Selecting date', { date });

    // Find and click the date
    const dateButtons = this.page.locator('.date-pills button, .date-selector button');
    const count = await dateButtons.count();

    for (let i = 0; i < count; i++) {
      const button = dateButtons.nth(i);
      const text = await button.textContent();
      if (text?.includes(date)) {
        await button.click();
        await this.delay(500);
        return;
      }
    }

    logger.warn('Date not found, using default');
  }

  async getTheatres(): Promise<string[]> {
    const theatreElements = this.page.locator('[data-testid="cinema-name"], .venue-name');
    const count = await theatreElements.count();

    const theatres: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await theatreElements.nth(i).textContent();
      if (text) theatres.push(text.trim());
    }

    logger.info('Found theatres', { count: theatres.length });
    return theatres;
  }

  async selectTheatreShowtime(
    theatreName: string,
    preferredTimes: string[] = []
  ): Promise<boolean> {
    logger.info('Looking for theatre', { theatreName, preferredTimes });

    // Find theatre section
    const theatreSection = this.page
      .locator('.venue-details, [data-testid="venue-row"]')
      .filter({ hasText: theatreName })
      .first();

    const exists = (await theatreSection.count()) > 0;
    if (!exists) {
      logger.warn('Theatre not found', { theatreName });
      return false;
    }

    // Find showtimes within this theatre
    const showtimes = theatreSection.locator('a[href*="/buytickets/"], button.showtime-pill');
    const count = await showtimes.count();

    if (count === 0) {
      logger.warn('No showtimes found for theatre', { theatreName });
      return false;
    }

    // Try preferred times first
    for (const preferredTime of preferredTimes) {
      for (let i = 0; i < count; i++) {
        const showtime = showtimes.nth(i);
        const text = await showtime.textContent();

        if (text?.includes(preferredTime)) {
          logger.info('Found preferred showtime', { time: preferredTime });
          await showtime.click();
          await this.waitForLoad();
          return true;
        }
      }
    }

    // No preferred time found, click first available
    logger.info('Using first available showtime');
    await showtimes.first().click();
    await this.waitForLoad();
    return true;
  }

  async clickFirstAvailableShowtime(): Promise<boolean> {
    const showtimes = this.page.locator('a[href*="/buytickets/"]');
    const count = await showtimes.count();

    if (count === 0) {
      return false;
    }

    await showtimes.first().click();
    await this.waitForLoad();
    return true;
  }
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add ShowtimesPage for theatre and time selection"
```

---

## Task 6: BMS Seat Selection Page

**Files:**
- Create: `src/automation/pages/SeatPage.ts`

**Step 1: Create src/automation/pages/SeatPage.ts**

```typescript
import { Page, Locator } from 'playwright';
import { BasePage } from './BasePage.js';
import { logger } from '../../utils/logger.js';
import {
  SeatLayout,
  SeatPrefs,
  Seat,
  Row,
  findBestAdjacentSeats,
  meetsMinimumScore,
  SeatGroup,
} from '../seatSelector.js';

export class SeatPage extends BasePage {
  private selectedSeats: Seat[] = [];

  private selectors = {
    seatMap: '.seat-layout, [data-testid="seat-layout"]',
    seatRow: '.seat-row, [data-testid="seat-row"]',
    seat: '.seat, [data-testid="seat"]',
    seatAvailable: '.seat--available, [data-testid="seat-available"]',
    seatSelected: '.seat--selected, [data-testid="seat-selected"]',
    seatSold: '.seat--sold, [data-testid="seat-sold"]',
    proceedButton: 'button:has-text("Proceed"), button:has-text("Pay")',
    ticketCount: '[data-testid="ticket-count"]',
    totalPrice: '.total-price, [data-testid="total-price"]',
    categoryTabs: '.category-tabs, [data-testid="category-tabs"]',
  };

  constructor(page: Page) {
    super(page, 'SeatPage');
  }

  async waitForSeatMap(): Promise<boolean> {
    try {
      await this.page.waitForSelector('.seat-layout, svg, .seatlayout', {
        timeout: 15000,
      });
      await this.delay(1000); // Let seats render
      return true;
    } catch {
      logger.warn('Seat map not loaded');
      return false;
    }
  }

  async parseSeatLayout(): Promise<SeatLayout | null> {
    logger.info('Parsing seat layout');

    try {
      // BMS uses SVG or div-based seat layouts
      // This is a simplified parser - real implementation needs DOM inspection
      const layout = await this.page.evaluate(() => {
        const rows: any[] = [];
        let maxSeats = 0;
        const categories = new Set<string>();

        // Find all seat rows
        const rowElements = document.querySelectorAll(
          '.seat-row, [data-row], g[data-row]'
        );

        rowElements.forEach((rowEl, rowIndex) => {
          const rowId =
            rowEl.getAttribute('data-row') ||
            String.fromCharCode(65 + rowIndex);
          const seats: any[] = [];

          const seatElements = rowEl.querySelectorAll(
            '.seat, [data-seat], rect[data-seat]'
          );

          seatElements.forEach((seatEl, seatIndex) => {
            const seatNum = parseInt(
              seatEl.getAttribute('data-seat') || String(seatIndex + 1)
            );
            const status = seatEl.classList.contains('sold') ||
              seatEl.classList.contains('unavailable')
              ? 'sold'
              : seatEl.classList.contains('blocked')
              ? 'blocked'
              : 'available';

            const category =
              seatEl.getAttribute('data-category') || 'Standard';
            categories.add(category);

            seats.push({
              id: `${rowId}-${seatNum}`,
              row: rowId,
              number: seatNum,
              status,
              price: parseInt(seatEl.getAttribute('data-price') || '0'),
              category,
            });
          });

          if (seats.length > 0) {
            rows.push({
              id: rowId,
              rowNumber: rowIndex + 1,
              seats,
            });
            maxSeats = Math.max(maxSeats, seats.length);
          }
        });

        return {
          rows,
          totalRows: rows.length,
          maxSeatsPerRow: maxSeats,
          categories: Array.from(categories),
        };
      });

      if (layout.rows.length === 0) {
        logger.warn('No seats found in layout');
        return null;
      }

      logger.info('Parsed seat layout', {
        rows: layout.totalRows,
        maxSeats: layout.maxSeatsPerRow,
        categories: layout.categories,
      });

      return layout as SeatLayout;
    } catch (error) {
      logger.error('Failed to parse seat layout', { error });
      return null;
    }
  }

  async selectOptimalSeats(prefs: SeatPrefs): Promise<SeatGroup | null> {
    const layout = await this.parseSeatLayout();
    if (!layout) {
      return null;
    }

    const bestGroup = findBestAdjacentSeats(layout, prefs);
    if (!bestGroup) {
      logger.warn('No suitable seats found');
      return null;
    }

    logger.info('Found optimal seats', {
      seats: bestGroup.seats.map((s) => s.id),
      score: bestGroup.avgScore.toFixed(2),
    });

    // Click each seat
    for (const seat of bestGroup.seats) {
      await this.clickSeat(seat.id);
    }

    this.selectedSeats = bestGroup.seats;
    return bestGroup;
  }

  async clickSeat(seatId: string): Promise<boolean> {
    try {
      // Try multiple selector strategies
      const selectors = [
        `[data-seat-id="${seatId}"]`,
        `[data-id="${seatId}"]`,
        `#seat-${seatId}`,
        `.seat[data-seat="${seatId.split('-')[1]}"][data-row="${seatId.split('-')[0]}"]`,
      ];

      for (const selector of selectors) {
        const seat = this.page.locator(selector);
        if ((await seat.count()) > 0) {
          await seat.click();
          logger.debug('Clicked seat', { seatId });
          await this.delay(300);
          return true;
        }
      }

      logger.warn('Seat not found', { seatId });
      return false;
    } catch (error) {
      logger.error('Failed to click seat', { seatId, error });
      return false;
    }
  }

  async getSelectedCount(): Promise<number> {
    const selected = this.page.locator('.seat--selected, [data-selected="true"]');
    return await selected.count();
  }

  async getTotalPrice(): Promise<number> {
    try {
      const priceText = await this.getText('.total-amount, .total-price');
      const match = priceText.match(/[\d,]+/);
      return match ? parseInt(match[0].replace(/,/g, '')) : 0;
    } catch {
      return 0;
    }
  }

  async proceedToPayment(): Promise<boolean> {
    try {
      const proceedBtn = this.page.locator('button:has-text("Proceed"), button:has-text("Pay")');
      await proceedBtn.waitFor({ state: 'visible', timeout: 5000 });
      await proceedBtn.click();
      await this.waitForLoad();
      return true;
    } catch (error) {
      logger.error('Failed to proceed to payment', { error });
      return false;
    }
  }

  getSelectedSeats(): Seat[] {
    return this.selectedSeats;
  }
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add SeatPage with seat parsing and selection"
```

---

## Task 7: BMS Payment Page

**Files:**
- Create: `src/automation/pages/PaymentPage.ts`

**Step 1: Create src/automation/pages/PaymentPage.ts**

```typescript
import { Page } from 'playwright';
import { BasePage } from './BasePage.js';
import { logger } from '../../utils/logger.js';

export interface BookingResult {
  success: boolean;
  bookingId?: string;
  seats?: string[];
  totalPaid?: number;
  screenshotPath?: string;
  error?: string;
}

export class PaymentPage extends BasePage {
  private selectors = {
    giftCardOption: '[data-testid="gift-card"], button:has-text("Gift Card")',
    giftCardInput: 'input[placeholder*="Card Number"], input[name="giftcard"]',
    giftCardPin: 'input[placeholder*="PIN"], input[name="pin"]',
    applyGiftCard: 'button:has-text("Apply"), button:has-text("Redeem")',
    giftCardBalance: '.gift-card-balance, [data-testid="gc-balance"]',
    payButton: 'button:has-text("Pay"), button:has-text("Complete")',
    totalAmount: '.total-amount, [data-testid="total-amount"]',
    emailInput: 'input[type="email"], input[name="email"]',
    phoneInput: 'input[type="tel"], input[name="phone"], input[name="mobile"]',
    bookingConfirmation: '.booking-confirmation, [data-testid="booking-success"]',
    bookingId: '.booking-id, [data-testid="booking-id"]',
    errorMessage: '.error-message, [data-testid="error"]',
  };

  constructor(page: Page) {
    super(page, 'PaymentPage');
  }

  async waitForPaymentPage(): Promise<boolean> {
    try {
      await this.page.waitForSelector('.payment-container, [data-testid="payment"]', {
        timeout: 15000,
      });
      return true;
    } catch {
      logger.warn('Payment page not loaded');
      return false;
    }
  }

  async fillContactDetails(email: string, phone: string): Promise<void> {
    logger.info('Filling contact details');

    try {
      const emailInput = this.page.locator(this.selectors.emailInput).first();
      if (await emailInput.isVisible()) {
        await emailInput.fill(email);
      }

      const phoneInput = this.page.locator(this.selectors.phoneInput).first();
      if (await phoneInput.isVisible()) {
        await phoneInput.fill(phone);
      }
    } catch (error) {
      logger.warn('Could not fill contact details', { error });
    }
  }

  async selectGiftCardPayment(): Promise<boolean> {
    try {
      const giftCardOption = this.page.locator(this.selectors.giftCardOption).first();
      await giftCardOption.waitFor({ state: 'visible', timeout: 5000 });
      await giftCardOption.click();
      await this.delay(500);
      return true;
    } catch {
      logger.warn('Gift card option not found');
      return false;
    }
  }

  async applyGiftCard(cardNumber: string, pin: string): Promise<boolean> {
    logger.info('Applying gift card', { cardNumber: `****${cardNumber.slice(-4)}` });

    try {
      // Enter card number
      const cardInput = this.page.locator(this.selectors.giftCardInput).first();
      await cardInput.waitFor({ state: 'visible', timeout: 5000 });
      await cardInput.fill(cardNumber);

      // Enter PIN
      const pinInput = this.page.locator(this.selectors.giftCardPin).first();
      await pinInput.fill(pin);

      // Click apply
      const applyBtn = this.page.locator(this.selectors.applyGiftCard).first();
      await applyBtn.click();

      // Wait for response
      await this.delay(2000);

      // Check for error
      const hasError = await this.isVisible('.error, [data-testid="gc-error"]', 2000);
      if (hasError) {
        const errorText = await this.getText('.error, [data-testid="gc-error"]');
        logger.error('Gift card error', { error: errorText });
        return false;
      }

      logger.info('Gift card applied successfully');
      return true;
    } catch (error) {
      logger.error('Failed to apply gift card', { error });
      return false;
    }
  }

  async getGiftCardBalance(): Promise<number> {
    try {
      const balanceText = await this.getText(this.selectors.giftCardBalance);
      const match = balanceText.match(/[\d,]+/);
      return match ? parseInt(match[0].replace(/,/g, '')) : 0;
    } catch {
      return 0;
    }
  }

  async getTotalAmount(): Promise<number> {
    try {
      const amountText = await this.getText(this.selectors.totalAmount);
      const match = amountText.match(/[\d,]+/);
      return match ? parseInt(match[0].replace(/,/g, '')) : 0;
    } catch {
      return 0;
    }
  }

  async completePayment(): Promise<BookingResult> {
    logger.info('Completing payment');

    try {
      // Take screenshot before payment
      await this.screenshot('before-payment');

      // Click pay button
      const payBtn = this.page.locator(this.selectors.payButton).first();
      await payBtn.waitFor({ state: 'visible', timeout: 5000 });
      await payBtn.click();

      // Wait for confirmation or error
      await this.delay(5000);

      // Check for success
      const hasConfirmation = await this.isVisible(
        this.selectors.bookingConfirmation,
        10000
      );

      if (hasConfirmation) {
        const screenshotPath = await this.screenshot('booking-success');
        const bookingId = await this.extractBookingId();

        logger.info('Booking successful', { bookingId });

        return {
          success: true,
          bookingId,
          screenshotPath,
        };
      }

      // Check for error
      const errorText = await this.getText(this.selectors.errorMessage);

      return {
        success: false,
        error: errorText || 'Payment failed',
        screenshotPath: await this.screenshot('payment-error'),
      };
    } catch (error) {
      logger.error('Payment error', { error });
      return {
        success: false,
        error: String(error),
        screenshotPath: await this.screenshot('payment-exception'),
      };
    }
  }

  private async extractBookingId(): Promise<string> {
    try {
      // Try multiple patterns
      const patterns = [
        /booking[:\s#]*([A-Z0-9]+)/i,
        /confirmation[:\s#]*([A-Z0-9]+)/i,
        /order[:\s#]*([A-Z0-9]+)/i,
      ];

      const pageText = await this.page.textContent('body');

      for (const pattern of patterns) {
        const match = pageText?.match(pattern);
        if (match?.[1]) {
          return match[1];
        }
      }

      return '';
    } catch {
      return '';
    }
  }
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add PaymentPage with gift card support"
```

---

## Task 8: Page Exports and Booking Flow

**Files:**
- Create: `src/automation/pages/index.ts`
- Create: `src/automation/bookingFlow.ts`

**Step 1: Create src/automation/pages/index.ts**

```typescript
export { BasePage } from './BasePage.js';
export { HomePage } from './HomePage.js';
export { ShowtimesPage } from './ShowtimesPage.js';
export { SeatPage } from './SeatPage.js';
export { PaymentPage, BookingResult } from './PaymentPage.js';
```

**Step 2: Create src/automation/bookingFlow.ts**

```typescript
import { Browser, BrowserContext, Page } from 'playwright';
import { launchBrowser, createContext, createPage, closeBrowser, takeScreenshot } from './browser.js';
import { HomePage } from './pages/HomePage.js';
import { ShowtimesPage } from './pages/ShowtimesPage.js';
import { SeatPage } from './pages/SeatPage.js';
import { PaymentPage, BookingResult } from './pages/PaymentPage.js';
import { SeatPrefs } from './seatSelector.js';
import { logger } from '../utils/logger.js';

export interface BookingConfig {
  movieName: string;
  city: string;
  theatres: string[];           // Preferred theatres in order
  preferredTimes: string[];     // e.g., ["7:00 PM", "9:00 PM"]
  seatPrefs: SeatPrefs;
  userEmail: string;
  userPhone: string;
  giftCards: Array<{ cardNumber: string; pin: string }>;
}

export interface BookingAttemptResult {
  success: boolean;
  bookingResult?: BookingResult;
  error?: string;
  screenshotPath?: string;
}

export class BookingFlow {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async initialize(headless = true): Promise<void> {
    this.browser = await launchBrowser({ headless });
    this.context = await createContext(this.browser);
    this.page = await createPage(this.context);
    logger.info('Booking flow initialized');
  }

  async cleanup(): Promise<void> {
    if (this.context) {
      await this.context.close();
    }
    await closeBrowser();
    logger.info('Booking flow cleaned up');
  }

  async attemptBooking(config: BookingConfig): Promise<BookingAttemptResult> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' };
    }

    try {
      // Step 1: Navigate to movie
      logger.info('Starting booking attempt', { movie: config.movieName });
      const homePage = new HomePage(this.page);
      await homePage.navigate(config.city);
      await homePage.searchMovie(config.movieName);

      const movieFound = await homePage.selectMovieFromSearch(config.movieName);
      if (!movieFound) {
        return { success: false, error: 'Movie not found' };
      }

      // Step 2: Select showtime
      const showtimesPage = new ShowtimesPage(this.page);
      const hasShowtimes = await showtimesPage.waitForShowtimes();
      if (!hasShowtimes) {
        return { success: false, error: 'No showtimes available' };
      }

      // Try each preferred theatre
      let showtimeSelected = false;
      for (const theatre of config.theatres) {
        showtimeSelected = await showtimesPage.selectTheatreShowtime(
          theatre,
          config.preferredTimes
        );
        if (showtimeSelected) break;
      }

      if (!showtimeSelected) {
        // Fallback to any available
        showtimeSelected = await showtimesPage.clickFirstAvailableShowtime();
      }

      if (!showtimeSelected) {
        return { success: false, error: 'No suitable showtime found' };
      }

      // Step 3: Select seats
      const seatPage = new SeatPage(this.page);
      const seatMapLoaded = await seatPage.waitForSeatMap();
      if (!seatMapLoaded) {
        return { success: false, error: 'Seat map not loaded' };
      }

      const selectedGroup = await seatPage.selectOptimalSeats(config.seatPrefs);
      if (!selectedGroup) {
        return {
          success: false,
          error: 'No suitable seats available',
          screenshotPath: await takeScreenshot(this.page, 'no-seats'),
        };
      }

      // Check if seats meet minimum score
      if (selectedGroup.avgScore < 0.4) {
        logger.warn('Only poor seats available', { score: selectedGroup.avgScore });
        // Could pause here for user consent in real implementation
      }

      const proceeded = await seatPage.proceedToPayment();
      if (!proceeded) {
        return { success: false, error: 'Could not proceed to payment' };
      }

      // Step 4: Complete payment
      const paymentPage = new PaymentPage(this.page);
      const paymentLoaded = await paymentPage.waitForPaymentPage();
      if (!paymentLoaded) {
        return { success: false, error: 'Payment page not loaded' };
      }

      // Fill contact info
      await paymentPage.fillContactDetails(config.userEmail, config.userPhone);

      // Apply gift cards
      for (const giftCard of config.giftCards) {
        await paymentPage.selectGiftCardPayment();
        const applied = await paymentPage.applyGiftCard(
          giftCard.cardNumber,
          giftCard.pin
        );
        if (!applied) {
          logger.warn('Gift card failed to apply', {
            card: `****${giftCard.cardNumber.slice(-4)}`,
          });
        }
      }

      // Complete payment
      const bookingResult = await paymentPage.completePayment();

      return {
        success: bookingResult.success,
        bookingResult,
        error: bookingResult.error,
        screenshotPath: bookingResult.screenshotPath,
      };
    } catch (error) {
      logger.error('Booking attempt failed', { error });
      const screenshotPath = this.page
        ? await takeScreenshot(this.page, 'booking-error')
        : undefined;

      return {
        success: false,
        error: String(error),
        screenshotPath,
      };
    }
  }
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add page exports and booking flow orchestration"
```

---

## Task 9: Manual Booking Test Script

**Files:**
- Create: `src/automation/testBooking.ts`

**Step 1: Create src/automation/testBooking.ts**

```typescript
/**
 * Manual test script for the booking flow
 * Run with: HEADLESS=false yarn tsx src/automation/testBooking.ts
 */

import 'dotenv/config';
import { BookingFlow, BookingConfig } from './bookingFlow.js';
import { logger } from '../utils/logger.js';

async function main() {
  const flow = new BookingFlow();

  const config: BookingConfig = {
    movieName: 'Pushpa 2', // Change to a movie currently showing
    city: 'hyderabad',
    theatres: ['PVR', 'INOX', 'Cinepolis'], // Partial names work
    preferredTimes: ['7:00', '8:00', '9:00'],
    seatPrefs: {
      count: 2,
      avoidBottomRows: 3,
      preferCenter: true,
      needAdjacent: true,
    },
    userEmail: 'test@example.com',
    userPhone: '9876543210',
    giftCards: [
      // Add real gift card for actual test
      // { cardNumber: '1234567890123456', pin: '1234' },
    ],
  };

  try {
    // Run in headed mode for debugging
    await flow.initialize(false);

    logger.info('Starting test booking', { config });
    const result = await flow.attemptBooking(config);

    if (result.success) {
      logger.info('Booking successful!', {
        bookingId: result.bookingResult?.bookingId,
        screenshot: result.screenshotPath,
      });
    } else {
      logger.error('Booking failed', {
        error: result.error,
        screenshot: result.screenshotPath,
      });
    }
  } catch (error) {
    logger.error('Test failed', { error });
  } finally {
    // Keep browser open for debugging
    logger.info('Test complete. Press Ctrl+C to exit.');
    await new Promise(() => {}); // Keep alive
  }
}

main();
```

**Step 2: Add test script to package.json**

Add to scripts section:

```json
"test:booking": "HEADLESS=false tsx src/automation/testBooking.ts"
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add manual booking test script"
```

---

## Task 10: Update Exports and Documentation

**Files:**
- Create: `src/automation/index.ts`
- Update: `README.md`

**Step 1: Create src/automation/index.ts**

```typescript
// Browser management
export { launchBrowser, createContext, createPage, closeBrowser, takeScreenshot } from './browser.js';

// Page objects
export { BasePage } from './pages/BasePage.js';
export { HomePage } from './pages/HomePage.js';
export { ShowtimesPage } from './pages/ShowtimesPage.js';
export { SeatPage } from './pages/SeatPage.js';
export { PaymentPage } from './pages/PaymentPage.js';

// Seat selection
export {
  Seat,
  Row,
  SeatLayout,
  SeatPrefs,
  SeatGroup,
  scoreSeat,
  findConsecutiveGroups,
  findBestAdjacentSeats,
  meetsMinimumScore,
} from './seatSelector.js';

// Booking flow
export { BookingFlow, BookingConfig, BookingAttemptResult } from './bookingFlow.js';
```

**Step 2: Update README to document Phase 2**

Add to README.md before the "## Commands" section:

```markdown
## Automation

The automation layer uses Playwright to interact with BookMyShow.

### Testing the Booking Flow

```bash
# Run headed (visible browser) for debugging
yarn test:booking
```

### Architecture

- `src/automation/browser.ts` - Browser management with stealth config
- `src/automation/pages/` - Page Object Model classes
- `src/automation/seatSelector.ts` - Seat scoring algorithm
- `src/automation/bookingFlow.ts` - Full booking orchestration
```

**Step 3: Run all tests**

```bash
yarn test
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add automation exports and update documentation"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `yarn test` - All tests pass (browser, seatSelector)
- [ ] `yarn build` - TypeScript compiles without errors
- [ ] `yarn test:booking` - Opens browser and attempts flow (may fail on BMS changes)
- [ ] Screenshots directory exists with `.gitignore` entry
- [ ] All page objects have consistent structure

---

**End of Phase 2 Plan**
