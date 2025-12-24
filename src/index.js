/**
 * Main Entry Point - Movie Booking Automation
 * 
 * LEARNING CONCEPT: Flow Orchestration
 * -------------------------------------
 * This file demonstrates:
 * 1. Orchestrating multiple page objects
 * 2. Error handling and recovery
 * 3. State management across pages
 * 4. Graceful shutdown
 */

import { chromium } from 'playwright';
import { config, validateConfig } from './config/config.js';
import { HomePage } from './pages/HomePage.js';
import { TheatrePage } from './pages/TheatrePage.js';
import { SeatPage } from './pages/SeatPage.js';
import { PaymentPage } from './pages/PaymentPage.js';

/**
 * Main booking flow
 */
async function runBookingAutomation() {
  console.log('🎬 Movie Booking Automation Started');
  console.log('=====================================\n');
  
  // Validate configuration
  validateConfig();
  
  let browser = null;
  let context = null;
  let page = null;
  
  try {
    // ========================================
    // STEP 1: BROWSER SETUP
    // ========================================
    console.log('📱 Step 1: Launching browser...');
    
    browser = await chromium.launch({
      headless: config.browser.headless,
      slowMo: config.browser.slowMo,
    });
    
    context = await browser.newContext({
      viewport: config.browser.viewport,
      // Record video if enabled
      ...(config.browser.recordVideo && {
        recordVideo: { dir: './videos' }
      }),
    });
    
    page = await context.newPage();
    
    // Set default timeouts
    page.setDefaultTimeout(config.browser.defaultTimeout);
    page.setDefaultNavigationTimeout(config.browser.navigationTimeout);
    
    console.log('✅ Browser launched\n');
    
    // ========================================
    // STEP 2: NAVIGATE TO HOME PAGE
    // ========================================
    console.log('🏠 Step 2: Navigating to home page...');
    
    const homePage = new HomePage(page);
    await homePage.navigate();
    
    console.log('✅ Home page loaded\n');
    
    // ========================================
    // STEP 3: SEARCH AND SELECT MOVIE
    // ========================================
    console.log(`🎥 Step 3: Searching for "${config.movie.name}"...`);
    
    // Set date first
    await homePage.selectDate(config.movie.date);
    
    // Search and select movie
    const movieFound = await homePage.selectMovie(config.movie.name);
    
    if (!movieFound) {
      throw new Error(`Movie "${config.movie.name}" not found`);
    }
    
    console.log('✅ Movie selected\n');
    
    // ========================================
    // STEP 4: SELECT THEATRE AND SHOWTIME
    // ========================================
    console.log('🎭 Step 4: Finding best theatre and showtime...');
    
    const theatrePage = new TheatrePage(page);
    const hasShowtimes = await theatrePage.waitForLoad();
    
    if (!hasShowtimes) {
      throw new Error('No showtimes available for this movie');
    }
    
    // Debug: Log available options
    await theatrePage.logAvailableOptions();
    
    // Select the best option
    const theatreSelected = await theatrePage.selectBestOption();
    
    if (!theatreSelected) {
      throw new Error('Could not find matching theatre/showtime');
    }
    
    console.log('✅ Theatre and showtime selected\n');
    
    // ========================================
    // STEP 5: SELECT SEATS
    // ========================================
    console.log(`💺 Step 5: Selecting ${config.seats.count} seats...`);
    
    const seatPage = new SeatPage(page);
    await seatPage.waitForLoad();
    
    // Debug: Log seat layout
    await seatPage.logSeatLayout();
    
    // Select optimal seats
    const seatsSelected = await seatPage.selectOptimalSeats();
    
    if (!seatsSelected) {
      throw new Error('Could not select required seats');
    }
    
    console.log(`✅ Selected seats: ${seatPage.selectedSeats.map(s => s.id).join(', ')}\n`);
    
    // ========================================
    // STEP 6: PROCEED TO PAYMENT
    // ========================================
    console.log('💰 Step 6: Proceeding to payment...');
    
    const totalPrice = await seatPage.proceedToPayment();
    console.log(`   Total amount: ₹${totalPrice}`);
    
    const paymentPage = new PaymentPage(page);
    await paymentPage.waitForLoad();
    
    console.log('✅ Payment page loaded\n');
    
    // ========================================
    // STEP 7: COMPLETE PAYMENT (Simulated)
    // ========================================
    console.log('💳 Step 7: Processing payment (SIMULATED)...');
    
    // In mock mode, simulate the payment
    if (config.mockSite.enabled) {
      const result = await paymentPage.simulatePayment();
      
      if (result.success) {
        console.log('\n🎉 BOOKING SUCCESSFUL!');
        console.log(`📝 Booking ID: ${result.bookingId}`);
      } else {
        console.log('\n❌ Booking failed');
      }
    } else {
      // In real mode, stop before payment
      console.log('\n⚠️ Real payment not automated. Stopping here.');
      console.log('   Complete the payment manually in the browser.');
      
      // Pause for manual intervention
      await page.pause();
    }
    
    console.log('\n=====================================');
    console.log('🎬 Automation Complete!');
    
  } catch (error) {
    console.error('\n❌ Error during automation:', error.message);
    
    // Take screenshot on failure
    if (page && config.browser.screenshotOnFailure) {
      const screenshotPath = `./screenshots/error-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 Screenshot saved: ${screenshotPath}`);
    }
    
    throw error;
  } finally {
    // ========================================
    // CLEANUP
    // ========================================
    if (browser) {
      // Give time to see the result
      if (!config.browser.headless) {
        console.log('\n⏳ Closing browser in 5 seconds...');
        await new Promise(r => setTimeout(r, 5000));
      }
      
      await browser.close();
      console.log('🔒 Browser closed');
    }
  }
}

/**
 * Run with retry support
 */
async function runWithRetry(maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`\n📍 Attempt ${attempt}/${maxAttempts}\n`);
      await runBookingAutomation();
      return; // Success, exit
    } catch (error) {
      console.error(`Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < maxAttempts) {
        console.log(`Retrying in ${config.retry.delayBetweenRetries / 1000} seconds...`);
        await new Promise(r => setTimeout(r, config.retry.delayBetweenRetries));
      }
    }
  }
  
  console.error('\n❌ All attempts failed');
  process.exit(1);
}

// ========================================
// ENTRY POINT
// ========================================

// Handle unhandled rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run the automation
runWithRetry(config.retry.maxAttempts);
