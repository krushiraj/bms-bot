# Movie Booking Automation - Playwright Learning Project

A hands-on project to learn browser automation using Playwright through a movie ticket booking scenario.

## 🎯 Learning Objectives

By working through this project, you'll learn:

1. **Playwright Fundamentals** - Browser launching, navigation, selectors
2. **Page Object Model (POM)** - Scalable architecture for automation
3. **Configuration Management** - Flexible, environment-based settings
4. **Waiting Strategies** - Handling dynamic content reliably
5. **Form Interactions** - Clicks, typing, dropdowns, seat selection
6. **State Management** - Cookies, storage, authentication
7. **Error Handling** - Retries, timeouts, graceful failures
8. **Parallel Execution** - Running multiple browser instances

## 📁 Project Structure

```
movie-booking-automation/
├── src/
│   ├── config/
│   │   └── config.js          # Centralized configuration
│   ├── pages/                  # Page Object Model classes
│   │   ├── BasePage.js        # Common page utilities
│   │   ├── HomePage.js        # Movie search page
│   │   ├── TheatrePage.js     # Theatre/showtime selection
│   │   ├── SeatPage.js        # Seat selection logic
│   │   └── PaymentPage.js     # Payment flow
│   ├── utils/
│   │   ├── browser.js         # Browser setup utilities
│   │   ├── selectors.js       # Selector strategies
│   │   └── waitHelpers.js     # Custom wait utilities
│   ├── strategies/
│   │   └── seatSelection.js   # Seat selection algorithms
│   └── index.js               # Main entry point
├── tests/                      # Test/demo scripts
│   └── demo.spec.js           # Playwright test examples
├── mock-site/                  # Local mock booking site for practice
│   ├── index.html
│   └── app.js
├── playwright.config.js        # Playwright configuration
├── package.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ installed
- Basic JavaScript knowledge

### Installation

```bash
cd movie-booking-automation
npm install
npx playwright install  # Downloads browser binaries
```

### Running the Mock Site (for practice)

```bash
npm run mock-site
# Opens a local booking site at http://localhost:3000
```

### Running the Automation

```bash
# Run in headed mode (see the browser)
npm run start:headed

# Run in headless mode
npm run start

# Run tests
npm test
```

## 📚 Key Concepts Explained

### 1. Page Object Model (POM)

Instead of writing selectors everywhere, we encapsulate page interactions:

```javascript
// ❌ Bad - selectors scattered in code
await page.click('.movie-card[data-id="123"]');
await page.click('.showtime-btn');

// ✅ Good - Page Object encapsulation
const homePage = new HomePage(page);
await homePage.selectMovie('Inception');
await homePage.pickShowtime('10:00 AM');
```

### 2. Selector Strategies (Priority Order)

```javascript
// 1. Test IDs (most reliable)
page.locator('[data-testid="book-button"]')

// 2. Role-based (accessible)
page.getByRole('button', { name: 'Book Now' })

// 3. Text content
page.getByText('Book Now')

// 4. CSS selectors (less preferred)
page.locator('.book-btn')

// 5. XPath (last resort)
page.locator('//button[contains(text(), "Book")]')
```

### 3. Waiting Strategies

```javascript
// Wait for element to be visible
await page.waitForSelector('.seats-container', { state: 'visible' });

// Wait for network idle (all requests complete)
await page.waitForLoadState('networkidle');

// Wait for specific response
await page.waitForResponse(resp => resp.url().includes('/api/seats'));

// Custom polling wait
await expect(page.locator('.seat.available')).toHaveCount(100, { timeout: 10000 });
```

### 4. Configuration Pattern

All configurable values are centralized:

```javascript
// config.js
module.exports = {
  movie: {
    name: 'Movie Name',
    date: '2024-01-15',
    preferredShowtimes: ['10:00 AM', '10:30 AM'],
  },
  theatres: ['PVR Phoenix', 'INOX GVK One'],
  seats: {
    count: 2,
    preference: 'center',  // center, aisle, back
    rows: ['G', 'H', 'I'], // preferred rows
  },
  browser: {
    headless: false,
    slowMo: 100,  // slow down for debugging
  }
};
```

## 🔧 Customization

Edit `src/config/config.js` to modify:
- Target movie and date
- Preferred theatres (priority order)
- Seat selection strategy
- Number of tickets
- Browser behavior

## 📖 Learning Path

1. **Start here**: Read through `src/pages/BasePage.js` to understand the foundation
2. **Understand flow**: Trace through `src/index.js` to see the booking flow
3. **Practice selectors**: Modify `src/utils/selectors.js` 
4. **Experiment**: Change seat selection logic in `src/strategies/seatSelection.js`
5. **Test**: Write your own tests in `tests/` directory

## ⚠️ Important Notes

- This is a **learning project** - use with mock sites only
- Real booking platforms have anti-bot measures and prohibit automation
- The patterns learned here apply to legitimate automation tasks:
  - Testing your own web applications
  - Automating internal business processes
  - Web scraping where permitted

## 🔗 Resources

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Playwright Selectors Guide](https://playwright.dev/docs/selectors)
- [Page Object Model Pattern](https://playwright.dev/docs/pom)
