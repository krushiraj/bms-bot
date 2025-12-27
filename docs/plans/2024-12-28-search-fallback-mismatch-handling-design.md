# Search Fallback & Preference Mismatch Handling Design

## Overview

Enhance the BMS bot with two capabilities:

1. **Smart Search Fallback** - Robust element finding with fuzzy city matching and theatre scrolling/filtering
2. **Preference Mismatch Handling** - Interactive notifications when user preferences don't match available options

## Goals

- Bot should search for elements (city, movie, theatre) when not immediately visible
- When preferred format/language/screen/time isn't available, notify user with screenshot
- User chooses: keep trying, book available, update preferences, or cancel
- 15-minute timeout pauses job if user doesn't respond

## Architecture

### New Job States

```
PENDING → WATCHING → (mismatch found) → AWAITING_INPUT
                                              ↓
                   ┌──────────────────────────┼──────────────────────────┐
                   ↓                          ↓                          ↓
              WATCHING              BOOKING                         PAUSED
           (keep trying)        (book available)              (15min timeout)
                                      ↓                              ↓
                                  COMPLETED                    (user responds)
                                                                     ↓
                                                          WATCHING or CANCELLED
```

### Database Schema Changes

```prisma
model BookingJob {
  // Existing fields...

  // New fields
  awaitingInputSince  DateTime?        // When mismatch was detected
  availableOptions    Json?            // Scraped available showtimes
  mismatchType        String?          // format|language|screen|time|theatre
  lastScreenshotPath  String?          // Path to latest screenshot
}

enum JobStatus {
  PENDING
  WATCHING
  AWAITING_INPUT  // NEW
  PAUSED          // NEW
  BOOKING
  COMPLETED
  FAILED
  CANCELLED
}
```

## Search Fallback Implementation

### City Fuzzy Matching

Common misspellings and aliases mapped to correct BMS city slugs:

```typescript
const CITY_ALIASES: Record<string, string> = {
  'bangalore': 'bengaluru',
  'bombay': 'mumbai',
  'madras': 'chennai',
  'calcutta': 'kolkata',
  'hydrabad': 'hyderabad',
  'hyderbad': 'hyderabad',
  'banglore': 'bengaluru',
  'bangaluru': 'bengaluru',
  'gurgaon': 'gurugram',
  'pondicherry': 'puducherry',
};

function normalizeCity(city: string): string {
  const normalized = city.toLowerCase().trim();
  return CITY_ALIASES[normalized] || normalized;
}
```

### Theatre Search Strategy

1. **Check visible viewport** - Look for theatre name in currently rendered list
2. **Use filter/search box** - BMS showtimes page has a filter input, type theatre name
3. **Scroll virtualized list** - If filter not available, scroll and check after each scroll
4. **Give up after 3 scrolls** - Trigger `theatre_not_found` mismatch

```typescript
async function findTheatre(page: Page, theatreName: string): Promise<boolean> {
  // Strategy 1: Check if visible
  if (await isTheatreVisible(page, theatreName)) {
    return true;
  }

  // Strategy 2: Use filter box
  const filterBox = page.locator('input[placeholder*="Filter"], input[placeholder*="Search"]');
  if (await filterBox.isVisible()) {
    await filterBox.fill(theatreName);
    await page.waitForTimeout(1000);
    if (await isTheatreVisible(page, theatreName)) {
      return true;
    }
  }

  // Strategy 3: Scroll through list
  for (let i = 0; i < 3; i++) {
    await scrollVenueList(page);
    if (await isTheatreVisible(page, theatreName)) {
      return true;
    }
  }

  return false;
}
```

### Movie Search Strategy

Already implemented with enhancement:

1. Look for movie card on homepage → click if found
2. Use search bar if not visible → type movie name
3. Select from search results
4. If not found → notify user "Movie not found on BMS"

## Preference Mismatch Handling

### Mismatch Scenarios

| Preference | Example Mismatch |
|------------|------------------|
| Format | Wanted 3D, only 2D available |
| Language | Wanted English, only Hindi/Telugu available |
| Screen | Wanted IMAX, only regular screens available |
| Time | Wanted 7:00 PM+, only morning shows available |
| Theatre | Wanted AMB Cinemas, not showing there |

### Scraping Available Options

When mismatch detected, scrape all available options:

```typescript
interface AvailableShowtime {
  theatre: string;
  language: string;
  format: string;
  screen?: string;        // IMAX, PCX, DOLBY, etc.
  times: string[];        // ["10:30 AM", "2:15 PM", "6:00 PM"]
}

interface AvailableOptions {
  scrapedAt: Date;
  theatre: string;
  options: AvailableShowtime[];
}
```

### Notification Format

```
⚠️ Preference Mismatch

Wanted: English, 3D, AMB Cinemas
Not found: English 3D not available

Available at AMB Cinemas:
• Hindi 2D - 10:30 AM, 2:15 PM, 6:00 PM
• Telugu 3D - 11:00 AM, 3:30 PM

Respond within 15 minutes or job will be paused.

[Keep Trying] [Book Available] [Update Prefs] [Cancel]
```

Screenshot of current browser state attached.

### User Response Options

| Button | Action |
|--------|--------|
| Keep Trying | Set status back to WATCHING, continue checking for original preferences |
| Book Available | Show available options as buttons, user picks, proceed to booking |
| Update Prefs | Show available format/language combos, then showtimes, update job and book |
| Cancel | Set status to CANCELLED, stop watching |

### Callback Data Format

```
mismatch:keep:{jobId}                    → Keep trying
mismatch:book:{jobId}                    → Book first available
mismatch:update:{jobId}                  → Start update flow
mismatch:select:{jobId}:{optionIndex}    → Select format/language combo
mismatch:time:{jobId}:{showtimeIndex}    → Select specific showtime
mismatch:cancel:{jobId}                  → Cancel job
```

### "Update Preferences" Flow

**Step 1: Select format/language combo**
```
Select from available options:

[Hindi 2D] [Telugu 3D]
```

**Step 2: Select showtime**
```
Select showtime for Telugu 3D:

[11:00 AM] [3:30 PM]
```

**Step 3: Confirm and proceed**
```
Updating job preferences:
• Format: 3D
• Language: Telugu
• Time: 3:30 PM

Proceeding to book...
```

## Timeout Handling

### Scheduler Task

New task runs every minute:

```typescript
async function checkAwaitingInputTimeouts(): Promise<void> {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  const timedOutJobs = await prisma.bookingJob.findMany({
    where: {
      status: 'AWAITING_INPUT',
      awaitingInputSince: { lt: fifteenMinutesAgo }
    },
    include: { user: true }
  });

  for (const job of timedOutJobs) {
    await jobService.updateJobStatus(job.id, 'PAUSED');
    await notificationService.notifyWithScreenshot(
      job.user.telegramId,
      {
        type: 'job_paused',
        jobId: job.id,
        movieName: job.movieName,
        error: 'No response to preference mismatch notification'
      },
      job.lastScreenshotPath
    );
  }
}
```

### Resuming Paused Jobs

- User responds to original mismatch buttons anytime → job resumes
- User uses `/jobs` → select job → "Resume" button
- Resuming sets status back to `WATCHING`

## New Notification Types

| Type | Trigger | Includes Screenshot |
|------|---------|---------------------|
| `preference_mismatch` | Preferred format/language/screen/time not found | Yes |
| `theatre_not_found` | None of preferred theatres have shows | Yes |
| `movie_not_found` | Movie not found on BMS | Yes |
| `job_paused` | 15min timeout with no response | Yes (last known state) |
| `job_resumed` | User responds after pause | No |

## File Changes Summary

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add new fields and status values |
| `src/automation/pages/HomePage.ts` | Add city fuzzy matching |
| `src/automation/pages/ShowtimesPage.ts` | Add theatre search, available options scraping |
| `src/worker/processors/watchProcessor.ts` | Add mismatch detection and notification logic |
| `src/worker/notificationService.ts` | Add new notification types with screenshots |
| `src/worker/jobScheduler.ts` | Add timeout checker task |
| `src/bot/index.ts` | Add mismatch callback handlers |
| `src/bot/menus/index.ts` | Add update preferences flow handlers |
| `src/bot/menus/keyboards.ts` | Add mismatch action keyboards |
| `src/services/jobService.ts` | Add methods for available options and state transitions |

## Testing Scenarios

1. **City misspelling** - Create job with "Bangalore" → should normalize to "bengaluru"
2. **Theatre not visible** - Theatre at bottom of list → should scroll/filter to find
3. **Format mismatch** - Want 3D, only 2D available → notification with options
4. **Language mismatch** - Want English, only Hindi → notification with options
5. **Time mismatch** - Want evening, only morning → notification with options
6. **User keeps trying** - Tap "Keep Trying" → job continues watching
7. **User updates prefs** - Tap "Update Prefs" → select new options → booking proceeds
8. **User cancels** - Tap "Cancel" → job cancelled
9. **User timeout** - No response for 15min → job paused, notification sent
10. **Resume paused job** - User responds after pause → job resumes
