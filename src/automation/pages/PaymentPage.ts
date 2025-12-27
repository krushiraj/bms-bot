import { Page } from 'playwright';
import { BasePage } from './BasePage.js';
import { logger } from '../../utils/logger.js';

export interface BookingResult {
  success: boolean;
  bookingId?: string;
  seats?: string[];
  theatre?: string;
  showtime?: string;
  totalPaid?: number;
  totalAmount?: number;
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
    giftCardError: '.error, [data-testid="gc-error"]',
    payButton: 'button:has-text("Pay"), button:has-text("Complete")',
    totalAmount: '.total-amount, [data-testid="total-amount"]',
    emailInput: 'input[type="email"], input[name="email"]',
    phoneInput: 'input[type="tel"], input[name="phone"], input[name="mobile"]',
    bookingConfirmation: '.booking-confirmation, [data-testid="booking-success"]',
    bookingId: '.booking-id, [data-testid="booking-id"]',
    errorMessage: '.error-message, [data-testid="error"]',
    paymentContainer: '.payment-container, [data-testid="payment"]',
    // BMS specific selectors
    skipButton: 'text=/Skip/i, div:has-text("Skip"), button:has-text("Skip")',
    noThanksButton: 'text=/No Thanks/i, text=/No, Thanks/i',
    continueButton: 'text=/Continue/i, button:has-text("Continue")',
    closeButton: '[data-testid="modal-close"], [class*="close"], button:has-text("×")',
  };

  constructor(page: Page) {
    super(page, 'PaymentPage');
  }

  /**
   * Handle intermediate screens (food offers, insurance, Terms & Conditions, etc.) after clicking Pay
   */
  async handleIntermediateScreens(): Promise<void> {
    logger.info('Checking for intermediate screens');

    // Try to dismiss any popups/offers up to 8 times
    for (let attempt = 0; attempt < 8; attempt++) {
      await this.page.waitForTimeout(1500);

      // Take a debug screenshot
      try {
        await this.page.screenshot({ path: `screenshots/debug/intermediate-${attempt}.png` });
      } catch {
        // Ignore
      }

      // Check for Terms & Conditions dialog - need to Accept
      const acceptBtn = this.page.locator('button:has-text("Accept")').first();
      if (await acceptBtn.isVisible().catch(() => false)) {
        logger.info('Found Accept button (Terms & Conditions), clicking');
        await acceptBtn.click();
        await this.page.waitForTimeout(1500);
        continue;
      }

      // Also try Accept via text pattern
      const acceptText = this.page.locator('text=/^Accept$/i').first();
      if (await acceptText.isVisible().catch(() => false)) {
        logger.info('Found Accept text, clicking');
        await acceptText.click();
        await this.page.waitForTimeout(1500);
        continue;
      }

      // Try Skip button
      const skipBtn = this.page.locator('text=/Skip/i').first();
      if (await skipBtn.isVisible().catch(() => false)) {
        logger.info('Found Skip button, clicking');
        await skipBtn.click();
        await this.page.waitForTimeout(1000);
        continue;
      }

      // Try No Thanks button
      const noThanksBtn = this.page.locator('text=/No.*Thanks/i').first();
      if (await noThanksBtn.isVisible().catch(() => false)) {
        logger.info('Found No Thanks button, clicking');
        await noThanksBtn.click();
        await this.page.waitForTimeout(1000);
        continue;
      }

      // Try Continue button
      const continueBtn = this.page.locator('button:has-text("Continue")').first();
      if (await continueBtn.isVisible().catch(() => false)) {
        logger.info('Found Continue button, clicking');
        await continueBtn.click();
        await this.page.waitForTimeout(1000);
        continue;
      }

      // Try Close button (X)
      const closeBtn = this.page.locator('[class*="close"]').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        const text = await closeBtn.textContent().catch(() => '');
        // Only click if it looks like a close button (×, X, or empty)
        if (!text || text.trim() === '×' || text.trim().toUpperCase() === 'X') {
          logger.info('Found Close button, clicking');
          await closeBtn.click();
          await this.page.waitForTimeout(1000);
          continue;
        }
      }

      // Try generic dismiss via JavaScript - including Accept button
      const dismissed = await this.page.evaluate(() => {
        // First priority: Accept button (for Terms & Conditions)
        const acceptButtons = document.querySelectorAll('button');
        for (const btn of acceptButtons) {
          const text = btn.textContent?.trim().toLowerCase() || '';
          if (text === 'accept' || text === 'i accept' || text === 'agree') {
            (btn as HTMLElement).click();
            return 'accept';
          }
        }

        // Look for modal overlays and close buttons
        const closeButtons = document.querySelectorAll(
          '[class*="close"], [class*="dismiss"], [aria-label*="close"], [aria-label*="dismiss"]'
        );
        for (const btn of closeButtons) {
          if ((btn as HTMLElement).offsetParent !== null) {
            (btn as HTMLElement).click();
            return 'close';
          }
        }

        // Look for Skip, No Thanks, or Continue text
        const allDivs = document.querySelectorAll('div, button, a, span');
        for (const el of allDivs) {
          const text = el.textContent?.toLowerCase().trim() || '';
          if (text === 'skip' || text === 'no thanks' || text === 'no, thanks' || text === 'continue') {
            (el as HTMLElement).click();
            return 'other';
          }
        }

        return false;
      });

      if (dismissed) {
        logger.info('Dismissed popup via JS', { type: dismissed });
        await this.page.waitForTimeout(1500);
        continue;
      }

      // Check if we're on the payment/checkout page
      const url = this.page.url();
      if (url.includes('payment') || url.includes('checkout') || url.includes('order')) {
        logger.info('Reached payment/checkout page');
        break;
      }

      // No more popups found
      logger.debug('No more intermediate screens found');
      break;
    }
  }

  async waitForPaymentPage(): Promise<boolean> {
    try {
      // First handle any intermediate screens
      await this.handleIntermediateScreens();

      // Take a debug screenshot
      try {
        await this.page.screenshot({ path: 'screenshots/debug/payment-page-check.png' });
      } catch {
        // Ignore
      }

      // Check URL for payment/checkout indicators
      const url = this.page.url();
      logger.info('Current URL after Pay click', { url });

      if (url.includes('payment') || url.includes('checkout') || url.includes('order')) {
        logger.info('On payment/checkout page by URL');
        return true;
      }

      // Try multiple payment page indicators
      const paymentIndicators = [
        this.selectors.paymentContainer,
        'text=/Payment/i',
        'text=/Checkout/i',
        'text=/Order Summary/i',
        'text=/Total Amount/i',
        'input[type="email"]',
        '[class*="payment"]',
        '[class*="checkout"]',
      ];

      for (const selector of paymentIndicators) {
        try {
          const el = this.page.locator(selector).first();
          if (await el.isVisible().catch(() => false)) {
            logger.info('Payment page detected', { selector });
            return true;
          }
        } catch {
          continue;
        }
      }

      // Wait a bit more and check again
      await this.page.waitForTimeout(3000);

      // Final URL check
      const finalUrl = this.page.url();
      if (finalUrl.includes('payment') || finalUrl.includes('checkout') || finalUrl.includes('order')) {
        return true;
      }

      logger.warn('Payment page not loaded', { url: finalUrl });
      return false;
    } catch (error) {
      logger.warn('Payment page not loaded', { error });
      return false;
    }
  }

  async fillContactDetails(email: string, phone: string): Promise<boolean> {
    try {
      logger.info('Filling contact details', { email, phone: `****${phone.slice(-4)}` });

      // Email validation - return false if invalid
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        logger.error('Invalid email format');
        return false;
      }

      // Phone validation - return false if invalid
      const phoneDigits = phone ? phone.replace(/\D/g, '') : '';
      if (phone && !/^\d{10,15}$/.test(phoneDigits)) {
        logger.error('Invalid phone format');
        return false;
      }

      // Wait for the contact details dialog/form
      await this.page.waitForTimeout(1000);

      // Try multiple email input selectors for BMS
      const emailSelectors = [
        'input[placeholder*="email"]',
        'input[placeholder*="abc@gmail.com"]',
        'input[type="email"]',
        'input[name="email"]',
        '[class*="email"] input',
        'input:near(:text("Your email"))',
      ];

      let emailFilled = false;
      for (const selector of emailSelectors) {
        try {
          const emailInput = this.page.locator(selector).first();
          if (await emailInput.isVisible().catch(() => false)) {
            await emailInput.clear();
            await emailInput.fill(email);
            logger.info('Filled email input', { selector });
            emailFilled = true;
            break;
          }
        } catch {
          continue;
        }
      }

      // Try JavaScript approach if locators didn't work
      if (!emailFilled) {
        const jsEmailFilled = await this.page.evaluate((emailValue: string) => {
          // Find input with placeholder containing email hints
          const inputs = document.querySelectorAll('input');
          for (const input of inputs) {
            const placeholder = input.getAttribute('placeholder')?.toLowerCase() || '';
            const type = input.getAttribute('type')?.toLowerCase() || '';
            if (placeholder.includes('email') || placeholder.includes('@') || type === 'email') {
              (input as HTMLInputElement).value = emailValue;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
          return false;
        }, email);

        if (jsEmailFilled) {
          logger.info('Filled email via JS');
          emailFilled = true;
        }
      }

      // Try phone input selectors
      const phoneSelectors = [
        'input[type="tel"]',
        'input[name="phone"]',
        'input[name="mobile"]',
        'input[placeholder*="mobile"]',
        'input[placeholder*="phone"]',
        '[class*="mobile"] input',
        'input:near(:text("Mobile Number"))',
      ];

      let phoneFilled = false;
      for (const selector of phoneSelectors) {
        try {
          const phoneInput = this.page.locator(selector).first();
          if (await phoneInput.isVisible().catch(() => false)) {
            // Check if already has value
            const currentValue = await phoneInput.inputValue().catch(() => '');
            if (!currentValue || currentValue !== phone) {
              await phoneInput.clear();
              await phoneInput.fill(phone);
            }
            logger.info('Phone input handled', { selector });
            phoneFilled = true;
            break;
          }
        } catch {
          continue;
        }
      }

      // Wait for form to validate
      await this.page.waitForTimeout(500);

      logger.info('Contact details filled', { emailFilled, phoneFilled });
      return emailFilled || phoneFilled; // At least one should be filled
    } catch (error) {
      logger.error('Failed to fill contact details', { error: String(error) });
      return false;
    }
  }

  async selectGiftCardPayment(): Promise<boolean> {
    try {
      logger.info('Selecting Gift Voucher payment option');

      // Take a debug screenshot
      await this.screenshot('before-gift-card-selection');

      // BMS payment options page has "Gift Voucher" as a clickable option
      const giftCardSelectors = [
        'text=/Gift Voucher/i',
        'div:has-text("Gift Voucher")',
        '[class*="gift"]',
        this.selectors.giftCardOption,
      ];

      for (const selector of giftCardSelectors) {
        try {
          const option = this.page.locator(selector).first();
          if (await option.isVisible().catch(() => false)) {
            logger.info('Found Gift Voucher option', { selector });
            await option.click();
            await this.page.waitForTimeout(2000);

            // Take screenshot after clicking
            await this.screenshot('after-gift-card-selection');
            return true;
          }
        } catch {
          continue;
        }
      }

      // Try JavaScript click
      const clicked = await this.page.evaluate(() => {
        const elements = document.querySelectorAll('div, span, a, button');
        for (const el of elements) {
          const text = el.textContent?.trim() || '';
          if (text === 'Gift Voucher' || text === 'Gift Card') {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (clicked) {
        logger.info('Clicked Gift Voucher via JS');
        await this.page.waitForTimeout(2000);
        await this.screenshot('after-gift-card-selection-js');
        return true;
      }

      logger.warn('Gift Voucher option not found');
      return false;
    } catch (error) {
      logger.warn('Gift card option not found', { error: String(error) });
      return false;
    }
  }

  async applyGiftCard(cardNumber: string, pin: string): Promise<{ applied: boolean; error?: string }> {
    try {
      // Validate card number (typically 16 digits)
      if (!cardNumber || cardNumber.length < 10) {
        logger.error('Invalid gift card number format');
        return { applied: false, error: 'Invalid card number format' };
      }

      // Validate PIN (typically 4-6 digits)
      if (!pin || pin.length < 4 || !/^\d+$/.test(pin)) {
        logger.error('Invalid gift card PIN format');
        return { applied: false, error: 'Invalid PIN format' };
      }

      // Log with masked card number only
      logger.info('Applying gift card', { cardNumber: `****${cardNumber.slice(-4)}` });

      // Take debug screenshot
      await this.screenshot('gift-card-form');

      // Try multiple selectors for card number input on BMS
      const cardInputSelectors = [
        'input[placeholder*="Card Number"]',
        'input[placeholder*="card number"]',
        'input[placeholder*="Gift Card"]',
        'input[placeholder*="gift card"]',
        'input[placeholder*="Enter"]',
        'input[name*="card"]',
        'input[name*="gift"]',
        '[class*="gift"] input',
        'input[type="text"]',
        this.selectors.giftCardInput,
      ];

      let cardInputFilled = false;
      for (const selector of cardInputSelectors) {
        try {
          const cardInput = this.page.locator(selector).first();
          if (await cardInput.isVisible().catch(() => false)) {
            await cardInput.clear();
            await cardInput.fill(cardNumber);
            logger.info('Filled card number', { selector });
            cardInputFilled = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!cardInputFilled) {
        // Try JavaScript approach
        const jsFilled = await this.page.evaluate((cardNum: string) => {
          const inputs = document.querySelectorAll('input');
          for (const input of inputs) {
            const placeholder = input.getAttribute('placeholder')?.toLowerCase() || '';
            if (placeholder.includes('card') || placeholder.includes('gift') || placeholder.includes('voucher')) {
              (input as HTMLInputElement).value = cardNum;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
          return false;
        }, cardNumber);

        if (jsFilled) {
          logger.info('Filled card number via JS');
          cardInputFilled = true;
        }
      }

      if (!cardInputFilled) {
        logger.error('Could not find card number input');
        return { applied: false, error: 'Card number input not found' };
      }

      await this.page.waitForTimeout(500);

      // Check if there's a separate PIN input field
      // BMS might use a single "GV code" field instead of card + PIN
      const pinInputSelectors = [
        'input[placeholder*="PIN"]',
        'input[placeholder*="pin"]',
        'input[placeholder*="Pin"]',
        'input[name*="pin"]',
        'input[type="password"]',
        this.selectors.giftCardPin,
      ];

      let pinInputFilled = false;
      for (const selector of pinInputSelectors) {
        try {
          const pinInput = this.page.locator(selector).first();
          if (await pinInput.isVisible().catch(() => false)) {
            await pinInput.clear();
            await pinInput.fill(pin);
            logger.info('Filled PIN', { selector });
            pinInputFilled = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!pinInputFilled) {
        // Try JavaScript approach for PIN
        const jsPinFilled = await this.page.evaluate((pinValue: string) => {
          const inputs = document.querySelectorAll('input');
          for (const input of inputs) {
            const placeholder = input.getAttribute('placeholder')?.toLowerCase() || '';
            const type = input.getAttribute('type')?.toLowerCase() || '';
            if (placeholder.includes('pin') || type === 'password') {
              (input as HTMLInputElement).value = pinValue;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
          return false;
        }, pin);

        if (jsPinFilled) {
          logger.info('Filled PIN via JS');
          pinInputFilled = true;
        }
      }

      // BMS Gift Voucher might only have a single code field (no separate PIN)
      // In that case, we just proceed with what we have
      if (!pinInputFilled) {
        logger.info('No separate PIN field found - BMS may use single GV code');
        // Continue anyway - some gift vouchers don't have separate PIN
      }

      await this.page.waitForTimeout(500);

      // Take screenshot before applying
      await this.screenshot('gift-card-filled');

      // Click Apply/Redeem/Pay Now button
      const applySelectors = [
        'button:has-text("Pay Now")',
        'button:has-text("Apply")',
        'button:has-text("Redeem")',
        'button:has-text("Verify")',
        'button:has-text("Check")',
        'text=/Pay Now/i',
        'text=/Apply/i',
        'text=/Redeem/i',
        this.selectors.applyGiftCard,
      ];

      let applyClicked = false;
      for (const selector of applySelectors) {
        try {
          const applyBtn = this.page.locator(selector).first();
          if (await applyBtn.isVisible().catch(() => false)) {
            await applyBtn.click();
            logger.info('Clicked Apply button', { selector });
            applyClicked = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!applyClicked) {
        // Try JavaScript click
        const jsApplyClicked = await this.page.evaluate(() => {
          const buttons = document.querySelectorAll('button, div, a');
          for (const btn of buttons) {
            const text = btn.textContent?.toLowerCase().trim() || '';
            if (text === 'pay now' || text === 'apply' || text === 'redeem' || text === 'verify') {
              (btn as HTMLElement).click();
              return true;
            }
          }
          return false;
        });

        if (jsApplyClicked) {
          logger.info('Clicked Apply via JS');
          applyClicked = true;
        }
      }

      if (!applyClicked) {
        logger.error('Could not find Apply button');
        return { applied: false, error: 'Apply button not found' };
      }

      // Wait for response
      await this.page.waitForTimeout(3000);

      // Take screenshot after apply
      await this.screenshot('gift-card-after-apply');

      // Check for error messages
      const errorText = await this.page.evaluate(() => {
        // Look for error messages using valid CSS selectors
        const errorSelectors = [
          '[class*="error"]',
          '[class*="Error"]',
          '[class*="invalid"]',
          '[class*="Invalid"]',
          '[class*="fail"]',
          '[class*="alert"]',
          '[class*="modal"]',
        ];

        for (const selector of errorSelectors) {
          try {
            const el = document.querySelector(selector);
            if (el && (el as HTMLElement).offsetParent !== null) {
              const text = (el as HTMLElement).textContent?.trim() || '';
              // Check if it contains error-related keywords
              if (text.toLowerCase().includes('invalid') || text.toLowerCase().includes('error') || text.toLowerCase().includes('fail')) {
                return text.substring(0, 100);
              }
            }
          } catch {
            // Ignore invalid selector errors
          }
        }

        // Also check page text for common error messages
        const bodyText = document.body.innerText.toLowerCase();
        if (bodyText.includes('invalid') || bodyText.includes('not valid') || bodyText.includes('incorrect')) {
          // Find the specific error message - look for modal or alert content
          const allElements = document.querySelectorAll('div, p, span, h1, h2, h3');
          for (const el of allElements) {
            const text = (el as HTMLElement).textContent?.trim() || '';
            const textLower = text.toLowerCase();
            // Look for error messages that are short and contain keywords
            if ((textLower.includes('invalid') || textLower.includes('not valid') || textLower.includes('incorrect')) &&
                text.length > 10 && text.length < 100) {
              return text;
            }
          }
          return 'Gift card or PIN is invalid';
        }

        return null;
      });

      if (errorText) {
        logger.info('Gift card rejected (expected for test)', { error: errorText });
        return { applied: false, error: errorText };
      }

      // Check for success indicators
      const successText = await this.page.evaluate(() => {
        const successIndicators = ['applied', 'success', 'balance', 'redeemed'];
        const bodyText = document.body.innerText.toLowerCase();
        for (const indicator of successIndicators) {
          if (bodyText.includes(indicator)) {
            return indicator;
          }
        }
        return null;
      });

      if (successText) {
        logger.info('Gift card applied successfully', { indicator: successText });
        return { applied: true };
      }

      // If no clear error or success, assume it didn't work but the flow completed
      logger.info('Gift card flow completed, no clear success/error detected');
      return { applied: false, error: 'Unknown result' };
    } catch (error) {
      // Sanitize error - don't include potentially sensitive details
      logger.error('Failed to apply gift card', { error: String(error).substring(0, 100) });
      await this.screenshot('gift-card-exception');
      return { applied: false, error: String(error).substring(0, 50) };
    }
  }

  async getGiftCardBalance(): Promise<number> {
    try {
      const balanceText = await this.getText(this.selectors.giftCardBalance);
      const match = balanceText.match(/[\d,]+/);
      return match ? parseInt(match[0].replace(/,/g, '')) : 0;
    } catch (error) {
      logger.debug('Failed to get gift card balance', { error });
      return 0;
    }
  }

  async getTotalAmount(): Promise<number> {
    try {
      const amountText = await this.getText(this.selectors.totalAmount);
      const match = amountText.match(/[\d,]+/);
      return match ? parseInt(match[0].replace(/,/g, '')) : 0;
    } catch (error) {
      logger.debug('Failed to get total amount', { error });
      return 0;
    }
  }

  async completePayment(): Promise<BookingResult> {
    logger.info('Completing payment');

    try {
      // Take screenshot before payment
      await this.screenshot('before-payment');

      // Try multiple button selectors - BMS uses "Submit" on contact form, then "Proceed to Pay" etc.
      const payButtonSelectors = [
        'button:has-text("Submit")',
        'button:has-text("Proceed")',
        'button:has-text("Pay")',
        'button:has-text("Complete")',
        'button:has-text("Make Payment")',
        'button:has-text("Confirm")',
        this.selectors.payButton,
        'text=/Submit/i',
        'text=/Proceed.*Pay/i',
      ];

      let payBtn = null;
      for (const selector of payButtonSelectors) {
        const btn = this.page.locator(selector).first();
        if (await btn.isVisible().catch(() => false)) {
          // Check if button is enabled
          const isDisabled = await btn.isDisabled().catch(() => true);
          if (!isDisabled) {
            payBtn = btn;
            logger.info('Found payment button', { selector });
            break;
          } else {
            logger.debug('Button found but disabled', { selector });
          }
        }
      }

      if (!payBtn) {
        // Try JavaScript to find and click the submit/pay button
        const clicked = await this.page.evaluate(() => {
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            const text = btn.textContent?.toLowerCase().trim() || '';
            if ((text === 'submit' || text.includes('pay') || text.includes('proceed') || text.includes('confirm')) &&
                !btn.disabled) {
              btn.click();
              return text;
            }
          }
          return null;
        });

        if (clicked) {
          logger.info('Clicked payment button via JS', { text: clicked });
          // Wait for response
          await this.page.waitForTimeout(3000);
        } else {
          return {
            success: false,
            error: 'Payment button not found or disabled',
            screenshotPath: await this.screenshot('payment-button-not-found'),
          };
        }
      } else {
        await payBtn.click();
      }

      // Wait for page transition or payment options to appear
      await this.page.waitForTimeout(3000);

      // Check if we reached the payment options page (this is success for automation)
      const paymentOptionsIndicators = [
        'text=/Payment options/i',
        'text=/Pay by any UPI/i',
        'text=/Gift Voucher/i',
        'text=/Debit.*Credit.*Card/i',
        'text=/Net Banking/i',
        'text=/Amount Payable/i',
        '[class*="payment-options"]',
      ];

      for (const selector of paymentOptionsIndicators) {
        try {
          const el = this.page.locator(selector).first();
          if (await el.isVisible().catch(() => false)) {
            logger.info('Reached payment options page - automation successful!');
            const screenshotPath = await this.screenshot('payment-options-reached');

            // Extract booking details from the page
            const totalAmount = await this.page.locator('text=/Amount Payable/i').locator('..').textContent().catch(() => '');
            const seatInfo = await this.page.locator('text=/GOLD|PLATINUM|LOUNGER/i').first().textContent().catch(() => '');

            return {
              success: true,
              bookingId: 'PENDING_PAYMENT', // Not confirmed yet, but seats reserved
              screenshotPath,
              totalPaid: 0,
              seats: seatInfo ? [seatInfo] : undefined,
            };
          }
        } catch {
          continue;
        }
      }

      // Wait for either confirmation or error to appear
      try {
        await Promise.race([
          this.page.waitForSelector(this.selectors.bookingConfirmation, { timeout: 20000 }),
          this.page.waitForSelector(this.selectors.errorMessage, { timeout: 20000 }),
        ]);
      } catch {
        // Timeout - neither confirmation nor error appeared
        logger.warn('Payment response timeout');
      }

      // Check for success
      const hasConfirmation = await this.isVisible(
        this.selectors.bookingConfirmation,
        2000
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

      // Final check - are we on a payment page at all?
      const currentUrl = this.page.url();
      if (currentUrl.includes('payment') || currentUrl.includes('checkout') || currentUrl.includes('order')) {
        logger.info('On payment/checkout page - considering as partial success');
        return {
          success: true,
          bookingId: 'PENDING_PAYMENT',
          screenshotPath: await this.screenshot('payment-page'),
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
      logger.error('Payment error', { error: String(error) });
      return {
        success: false,
        error: String(error),
        screenshotPath: await this.screenshot('payment-exception'),
      };
    }
  }

  private async extractBookingId(): Promise<string> {
    try {
      const patterns = [
        /booking[:\s#]*([A-Z0-9]+)/i,
        /confirmation[:\s#]*([A-Z0-9]+)/i,
        /order[:\s#]*([A-Z0-9]+)/i,
      ];

      const pageText = await this.page.textContent('body');

      if (pageText) {
        for (const pattern of patterns) {
          const match = pageText.match(pattern);
          if (match && match[1]) {
            return match[1];
          }
        }
      }

      return '';
    } catch (error) {
      logger.debug('Failed to extract booking ID', { error });
      return '';
    }
  }
}
