# 🚀 Quick Start Guide

Get up and running with this project in 5 minutes!

## Step 1: Install Dependencies

```bash
cd movie-booking-automation
npm install
npx playwright install
```

## Step 2: Start the Mock Site

```bash
npm run mock-site
```

Open http://localhost:3000 in your browser to see the mock booking site.

## Step 3: Run the Automation

In a new terminal:

```bash
# Run in headed mode (see the browser)
npm run start:headed
```

## Step 4: Run Tests

```bash
# Run all tests
npm test

# Run tests with visible browser
npm run test:headed

# Debug a specific test
npm run test:debug
```

## Step 5: Explore the Code

Start with these files:

1. **`src/config/config.js`** - All configurable settings
2. **`src/pages/BasePage.js`** - Core utilities and patterns
3. **`src/index.js`** - Main flow orchestration
4. **`tests/demo.spec.js`** - Example tests

## 🎯 Learning Path

1. **Beginner**: Run the mock site, explore the UI, run tests
2. **Intermediate**: Modify config, add new selectors, write tests
3. **Advanced**: Create new page objects, implement new features

## 🛠️ Useful Commands

| Command | Description |
|---------|-------------|
| `npm run mock-site` | Start the practice site |
| `npm run start:headed` | Run automation with visible browser |
| `npm run start:debug` | Run with debugging enabled |
| `npm test` | Run all Playwright tests |
| `npm run test:headed` | Run tests with visible browser |
| `npm run codegen` | Open Playwright codegen tool |
| `npm run report` | View test report |

## 📚 Key Concepts Covered

- ✅ Page Object Model (POM)
- ✅ Selector strategies
- ✅ Waiting mechanisms
- ✅ Form interactions
- ✅ Navigation handling
- ✅ Error recovery with retries
- ✅ Configuration management
- ✅ Test writing

## 🤔 Common Issues

**Mock site not loading?**
- Make sure port 3000 is free
- Check if server.js is running

**Tests failing?**
- Run mock site first: `npm run mock-site`
- Check if Playwright is installed: `npx playwright install`

**Want to see what's happening?**
- Use `npm run start:headed` or `npm run test:headed`
- Add `await page.pause()` in code to debug

Happy Learning! 🎬
