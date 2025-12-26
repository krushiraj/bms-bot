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
    giftCardError: '.error, [data-testid="gc-error"]',
    payButton: 'button:has-text("Pay"), button:has-text("Complete")',
    totalAmount: '.total-amount, [data-testid="total-amount"]',
    emailInput: 'input[type="email"], input[name="email"]',
    phoneInput: 'input[type="tel"], input[name="phone"], input[name="mobile"]',
    bookingConfirmation: '.booking-confirmation, [data-testid="booking-success"]',
    bookingId: '.booking-id, [data-testid="booking-id"]',
    errorMessage: '.error-message, [data-testid="error"]',
    paymentContainer: '.payment-container, [data-testid="payment"]',
  };

  constructor(page: Page) {
    super(page, 'PaymentPage');
  }

  async waitForPaymentPage(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.selectors.paymentContainer, {
        timeout: 15000,
      });
      return true;
    } catch (error) {
      logger.warn('Payment page not loaded', { error });
      return false;
    }
  }

  async fillContactDetails(email: string, phone: string): Promise<void> {
    try {
      logger.info('Filling contact details');

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
    } catch (error) {
      logger.warn('Gift card option not found', { error });
      return false;
    }
  }

  async applyGiftCard(cardNumber: string, pin: string): Promise<boolean> {
    try {
      if (!cardNumber || !pin) {
        logger.error('Invalid gift card credentials');
        return false;
      }

      logger.info('Applying gift card', { cardNumber: `****${cardNumber.slice(-4)}` });

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
      const hasError = await this.isVisible(this.selectors.giftCardError, 2000);
      if (hasError) {
        const errorText = await this.getText(this.selectors.giftCardError);
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
