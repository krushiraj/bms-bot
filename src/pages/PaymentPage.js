/**
 * PaymentPage - Payment Flow Handling
 * 
 * LEARNING CONCEPT: Form Automation & State Verification
 * -------------------------------------------------------
 * This page demonstrates:
 * 1. Form field automation
 * 2. Waiting for payment gateway loads
 * 3. Handling iframes (common in payment flows)
 * 4. State verification after actions
 * 
 * ⚠️ NOTE: This is for learning only. 
 * Never automate real payment flows without explicit authorization.
 */

import { BasePage } from './BasePage.js';

export class PaymentPage extends BasePage {
  constructor(page) {
    super(page);
    
    this.selectors = {
      // Order summary
      orderSummary: '[data-testid="order-summary"]',
      movieName: '[data-testid="movie-name"]',
      theatreName: '[data-testid="theatre-name"]',
      showtime: '[data-testid="showtime"]',
      seatNumbers: '[data-testid="seat-numbers"]',
      ticketCount: '[data-testid="ticket-count"]',
      
      // Pricing
      basePrice: '[data-testid="base-price"]',
      convenienceFee: '[data-testid="convenience-fee"]',
      taxes: '[data-testid="taxes"]',
      totalAmount: '[data-testid="total-amount"]',
      
      // Timer
      sessionTimer: '[data-testid="session-timer"]',
      
      // Payment methods
      paymentMethodSection: '[data-testid="payment-methods"]',
      paymentOption: '[data-testid="payment-option"]',
      upiOption: '[data-testid="payment-upi"]',
      cardOption: '[data-testid="payment-card"]',
      netBankingOption: '[data-testid="payment-netbanking"]',
      walletOption: '[data-testid="payment-wallet"]',
      
      // UPI
      upiInput: '[data-testid="upi-input"]',
      verifyUpiButton: '[data-testid="verify-upi"]',
      upiVerified: '[data-testid="upi-verified"]',
      
      // Card details
      cardNumberInput: '[data-testid="card-number"]',
      cardExpiryInput: '[data-testid="card-expiry"]',
      cardCvvInput: '[data-testid="card-cvv"]',
      cardNameInput: '[data-testid="card-name"]',
      
      // Payment gateway iframe
      paymentIframe: 'iframe[name*="payment"], iframe[src*="payment"]',
      
      // Actions
      payButton: '[data-testid="pay-button"], button:has-text("Pay")',
      cancelButton: '[data-testid="cancel-button"]',
      
      // Status
      paymentSuccess: '[data-testid="payment-success"]',
      paymentFailed: '[data-testid="payment-failed"]',
      bookingConfirmation: '[data-testid="booking-confirmation"]',
      bookingId: '[data-testid="booking-id"]',
      
      // Loading
      paymentProcessing: '[data-testid="payment-processing"]',
    };
  }

  // ============================================
  // PAGE LOAD
  // ============================================

  async waitForLoad() {
    this.log('Waiting for payment page to load');
    
    await this.waitForSelector(this.selectors.orderSummary);
    await this.waitForSelector(this.selectors.paymentMethodSection);
    
    this.log('Payment page loaded');
  }

  // ============================================
  // ORDER VERIFICATION
  // ============================================

  /**
   * Get order details for verification
   * 
   * LEARNING: Always verify before payment
   */
  async getOrderDetails() {
    const details = {
      movie: await this.getText(this.selectors.movieName),
      theatre: await this.getText(this.selectors.theatreName),
      showtime: await this.getText(this.selectors.showtime),
      seats: await this.getText(this.selectors.seatNumbers),
      ticketCount: await this.getText(this.selectors.ticketCount),
      totalAmount: await this.getText(this.selectors.totalAmount),
    };
    
    // Parse the total amount
    details.totalAmountValue = this.parsePrice(details.totalAmount);
    
    return details;
  }

  parsePrice(priceStr) {
    if (!priceStr) return null;
    const match = priceStr.match(/[\d,]+/);
    return match ? parseInt(match[0].replace(',', '')) : null;
  }

  /**
   * Verify order matches expectations
   */
  async verifyOrder(expected) {
    const details = await this.getOrderDetails();
    
    const issues = [];
    
    if (expected.movieName && !details.movie?.includes(expected.movieName)) {
      issues.push(`Movie mismatch: expected "${expected.movieName}", got "${details.movie}"`);
    }
    
    if (expected.seatCount && parseInt(details.ticketCount) !== expected.seatCount) {
      issues.push(`Seat count mismatch: expected ${expected.seatCount}, got ${details.ticketCount}`);
    }
    
    if (expected.maxTotal && details.totalAmountValue > expected.maxTotal) {
      issues.push(`Total exceeds limit: ₹${details.totalAmountValue} > ₹${expected.maxTotal}`);
    }
    
    if (issues.length > 0) {
      this.log('Order verification failed:');
      issues.forEach(i => this.log(`  - ${i}`));
      return { valid: false, issues, details };
    }
    
    this.log('Order verified successfully');
    return { valid: true, issues: [], details };
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  /**
   * Get remaining session time
   * 
   * LEARNING: Payment pages often have timeouts
   */
  async getSessionTimeRemaining() {
    const timerText = await this.getText(this.selectors.sessionTimer);
    if (!timerText) return null;
    
    // Parse "05:30" format
    const match = timerText.match(/(\d+):(\d+)/);
    if (match) {
      return parseInt(match[1]) * 60 + parseInt(match[2]);
    }
    return null;
  }

  /**
   * Check if session is about to expire
   */
  async isSessionExpiring(thresholdSeconds = 60) {
    const remaining = await this.getSessionTimeRemaining();
    return remaining !== null && remaining < thresholdSeconds;
  }

  // ============================================
  // PAYMENT METHOD SELECTION
  // ============================================

  /**
   * Select a payment method
   */
  async selectPaymentMethod(method) {
    this.log(`Selecting payment method: ${method}`);
    
    const methodSelectors = {
      upi: this.selectors.upiOption,
      card: this.selectors.cardOption,
      netbanking: this.selectors.netBankingOption,
      wallet: this.selectors.walletOption,
    };
    
    const selector = methodSelectors[method.toLowerCase()];
    if (!selector) {
      throw new Error(`Unknown payment method: ${method}`);
    }
    
    await this.click(selector);
    await this.sleep(500);
  }

  /**
   * Get available payment methods
   */
  async getAvailablePaymentMethods() {
    const methods = [];
    const options = await this.getAll(this.selectors.paymentOption);
    
    for (const option of options) {
      const name = await option.getAttribute('data-method') || await option.textContent();
      const isEnabled = !(await option.isDisabled());
      methods.push({ name: name?.trim(), isEnabled });
    }
    
    return methods;
  }

  // ============================================
  // UPI PAYMENT
  // ============================================

  /**
   * Complete UPI payment flow
   */
  async payWithUPI(upiId) {
    this.log(`Initiating UPI payment: ${upiId}`);
    
    await this.selectPaymentMethod('upi');
    await this.fill(this.selectors.upiInput, upiId);
    await this.click(this.selectors.verifyUpiButton);
    
    // Wait for UPI verification
    await this.waitForSelector(this.selectors.upiVerified, { timeout: 15000 });
    
    // Click pay button
    await this.click(this.selectors.payButton);
    
    // Wait for payment processing
    return await this.waitForPaymentResult();
  }

  // ============================================
  // CARD PAYMENT (Simulated)
  // ============================================

  /**
   * Fill card details
   * 
   * ⚠️ LEARNING ONLY - Never automate real card details
   */
  async fillCardDetails(cardDetails) {
    this.log('Filling card details (SIMULATED)');
    
    await this.selectPaymentMethod('card');
    
    // In real scenarios, card inputs are often in iframes
    // Here we demonstrate the pattern
    
    await this.fill(this.selectors.cardNumberInput, cardDetails.number);
    await this.fill(this.selectors.cardExpiryInput, cardDetails.expiry);
    await this.fill(this.selectors.cardCvvInput, cardDetails.cvv);
    await this.fill(this.selectors.cardNameInput, cardDetails.name);
  }

  // ============================================
  // PAYMENT GATEWAY IFRAME
  // ============================================

  /**
   * Handle payment gateway in iframe
   * 
   * LEARNING: Many payment gateways load in iframes
   */
  async getPaymentIframe() {
    const iframeHandle = await this.page.waitForSelector(this.selectors.paymentIframe);
    if (!iframeHandle) return null;
    
    const frame = await iframeHandle.contentFrame();
    return frame;
  }

  /**
   * Interact with payment iframe
   */
  async interactWithPaymentGateway(action) {
    const frame = await this.getPaymentIframe();
    if (!frame) {
      this.log('No payment iframe found');
      return false;
    }
    
    // Now you can interact with the frame
    // await frame.fill('input[name="otp"]', '123456');
    
    return true;
  }

  // ============================================
  // PAYMENT RESULT
  // ============================================

  /**
   * Wait for and return payment result
   */
  async waitForPaymentResult() {
    this.log('Waiting for payment result...');
    
    // Wait for either success or failure
    await this.page.waitForSelector(
      `${this.selectors.paymentSuccess}, ${this.selectors.paymentFailed}, ${this.selectors.bookingConfirmation}`,
      { timeout: 120000 }
    );
    
    // Check which state we're in
    if (await this.isVisible(this.selectors.paymentSuccess) || 
        await this.isVisible(this.selectors.bookingConfirmation)) {
      const bookingId = await this.getBookingId();
      this.log(`Payment successful! Booking ID: ${bookingId}`);
      return { success: true, bookingId };
    }
    
    this.log('Payment failed');
    return { success: false, bookingId: null };
  }

  /**
   * Get booking ID after successful payment
   */
  async getBookingId() {
    try {
      return await this.getText(this.selectors.bookingId);
    } catch {
      return null;
    }
  }

  // ============================================
  // CANCELLATION
  // ============================================

  /**
   * Cancel the booking process
   */
  async cancelBooking() {
    this.log('Canceling booking');
    
    if (await this.isVisible(this.selectors.cancelButton)) {
      await this.click(this.selectors.cancelButton);
      return true;
    }
    
    return false;
  }

  // ============================================
  // SIMULATION FOR LEARNING
  // ============================================

  /**
   * Simulate complete payment flow (for mock site)
   */
  async simulatePayment() {
    this.log('Simulating payment flow');
    
    // Verify order first
    const verification = await this.verifyOrder({
      seatCount: this.config.seats.count,
    });
    
    if (!verification.valid) {
      throw new Error('Order verification failed');
    }
    
    // Log order details
    console.log('\n=== Order Summary ===');
    console.log(`Movie: ${verification.details.movie}`);
    console.log(`Theatre: ${verification.details.theatre}`);
    console.log(`Showtime: ${verification.details.showtime}`);
    console.log(`Seats: ${verification.details.seats}`);
    console.log(`Total: ${verification.details.totalAmount}`);
    console.log('====================\n');
    
    // In mock mode, just click pay
    await this.click(this.selectors.payButton);
    
    return await this.waitForPaymentResult();
  }
}

export default PaymentPage;
