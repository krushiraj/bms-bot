import { Page } from 'playwright';
import { BasePage } from './BasePage.js';
import { logger } from '../../utils/logger.js';
import {
  SeatLayout,
  SeatPrefs,
  Seat,
  findBestAdjacentSeats,
  SeatGroup,
} from '../seatSelector.js';

export class SeatPage extends BasePage {
  private selectedSeats: Seat[] = [];

  private selectors = {
    seatMap: '.seat-layout, [data-testid="seat-layout"], svg, .seatlayout',
    seatRow: '.seat-row, [data-testid="seat-row"]',
    seat: '.seat, [data-testid="seat"]',
    seatAvailable: '.seat--available, [data-testid="seat-available"]',
    seatSelected: '.seat--selected, [data-testid="seat-selected"]',
    seatSold: '.seat--sold, [data-testid="seat-sold"]',
    proceedButton: 'button:has-text("Proceed"), button:has-text("Pay")',
    ticketCount: '[data-testid="ticket-count"]',
    totalPrice: '.total-price, [data-testid="total-price"]',
    categoryTabs: '.category-tabs, [data-testid="category-tabs"]',
    // BMS styled-component classes for seat selection
    seatCountDialog: 'div:has-text("How many seats?")',
    selectSeatsButton: 'div:has-text("Select Seats"), button:has-text("Select Seats")',
  };

  constructor(page: Page) {
    super(page, 'SeatPage');
  }

  /**
   * Handle the "How many seats?" dialog that appears on BMS
   */
  async handleSeatCountDialog(seatCount: number): Promise<boolean> {
    try {
      logger.info('Checking for seat count dialog', { seatCount });

      // Wait a moment for the dialog to appear
      await this.page.waitForTimeout(2000);

      // Check if the "How many seats?" dialog is visible
      const dialogVisible = await this.page.locator('text="How many seats?"').isVisible().catch(() => false);

      if (!dialogVisible) {
        logger.debug('No seat count dialog found, continuing');
        return true;
      }

      logger.info('Found seat count dialog');

      // Click on the seat count number (1, 2, 3, etc.)
      // The seat count buttons are divs with the number
      const seatCountButton = this.page.locator(`div`).filter({ hasText: new RegExp(`^${seatCount}$`) }).first();

      if (await seatCountButton.isVisible().catch(() => false)) {
        await seatCountButton.click();
        logger.info('Selected seat count', { count: seatCount });
        await this.page.waitForTimeout(500);
      }

      // Click "Select Seats" button
      const selectSeatsBtn = this.page.locator('div, button').filter({ hasText: /^Select Seats$/i }).first();

      if (await selectSeatsBtn.isVisible().catch(() => false)) {
        await selectSeatsBtn.click();
        logger.info('Clicked Select Seats button');
        await this.page.waitForTimeout(2000);
        return true;
      }

      // Try clicking by role
      const selectByRole = this.page.getByRole('button', { name: /select seats/i }).first();
      if (await selectByRole.isVisible().catch(() => false)) {
        await selectByRole.click();
        logger.info('Clicked Select Seats button (by role)');
        await this.page.waitForTimeout(2000);
        return true;
      }

      // Fallback - try using JavaScript to find and click
      const clicked = await this.page.evaluate((count: number) => {
        // Find the seat count number and click it
        const allDivs = document.querySelectorAll('div');
        for (const div of allDivs) {
          if (div.textContent?.trim() === String(count) && div.children.length === 0) {
            (div as HTMLElement).click();
            break;
          }
        }

        // Find and click Select Seats button
        for (const div of allDivs) {
          if (div.textContent?.trim() === 'Select Seats') {
            (div as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, seatCount);

      if (clicked) {
        logger.info('Clicked Select Seats via JS');
        await this.page.waitForTimeout(2000);
        return true;
      }

      logger.warn('Could not find Select Seats button');
      return false;
    } catch (error) {
      logger.error('Failed to handle seat count dialog', { error });
      return false;
    }
  }

  async waitForSeatMap(): Promise<boolean> {
    try {
      // Wait for any of the seat layout indicators
      const seatLayoutSelectors = [
        this.selectors.seatMap,
        '[class*="sc-fdng8"]',  // BMS seat class pattern
        'text="PLATINUM"',
        'text="GOLD"',
        'text="Available"',
      ];

      for (const selector of seatLayoutSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000 });
          logger.debug('Seat layout detected', { selector });
          await this.delay(2000); // Extra wait for all seats to render
          return true;
        } catch {
          continue;
        }
      }

      // Fallback - just wait and check if we're on seat-layout URL
      const url = this.page.url();
      if (url.includes('seat-layout')) {
        logger.debug('On seat layout page by URL');
        await this.delay(3000);
        return true;
      }

      logger.warn('Seat map not loaded');
      return false;
    } catch (error) {
      logger.warn('Seat map not loaded', { error });
      return false;
    }
  }

  async parseSeatLayout(): Promise<SeatLayout | null> {
    logger.info('Parsing seat layout');

    try {
      const layout = await this.page.evaluate(() => {
        const rows: Array<{
          id: string;
          rowNumber: number;
          seats: Array<{
            id: string;
            row: string;
            number: number;
            status: 'available' | 'sold' | 'blocked';
            price: number;
            category?: string;
          }>;
        }> = [];
        let maxSeats = 0;
        const categories = new Set<string>();

        const rowElements = document.querySelectorAll(
          '.seat-row, [data-row], g[data-row]'
        );

        rowElements.forEach((rowEl, rowIndex) => {
          const rowId =
            rowEl.getAttribute('data-row') ||
            String.fromCharCode(65 + rowIndex);
          const seats: Array<{
            id: string;
            row: string;
            number: number;
            status: 'available' | 'sold' | 'blocked';
            price: number;
            category?: string;
          }> = [];

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

      // Validate the layout structure
      if (!layout.rows || !Array.isArray(layout.rows) ||
          typeof layout.totalRows !== 'number' ||
          typeof layout.maxSeatsPerRow !== 'number') {
        logger.error('Invalid layout structure from DOM');
        return null;
      }

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
    try {
      // Validate preferences
      if (prefs.count <= 0) {
        logger.error('Invalid seat count', { count: prefs.count });
        return null;
      }

      // First try the simplified BMS-specific selection
      const bmsResult = await this.selectSeatsOnBMS(prefs.count);
      if (bmsResult) {
        return bmsResult;
      }

      // Fallback to original DOM parsing approach
      const layout = await this.parseSeatLayout();
      if (!layout || layout.rows.length === 0) {
        logger.warn('No seat layout available');
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

      // Click each seat and verify success
      const actuallySelected: Seat[] = [];
      for (const seat of bestGroup.seats) {
        const success = await this.clickSeat(seat.id);
        if (success) {
          actuallySelected.push(seat);
        } else {
          logger.warn('Failed to select seat, aborting', {
            seatId: seat.id,
            selected: actuallySelected.length
          });
          return null;
        }
      }

      this.selectedSeats = actuallySelected;
      return bestGroup;
    } catch (error) {
      logger.error('Failed to select optimal seats', { error });
      return null;
    }
  }

  /**
   * BMS-specific seat selection using canvas click coordinates
   * BMS renders seats on a canvas element, so we need to click on specific coordinates
   */
  async selectSeatsOnBMS(count: number): Promise<SeatGroup | null> {
    try {
      logger.info('Attempting BMS-specific seat selection', { count });

      // Wait for seats to be interactive
      await this.page.waitForTimeout(3000);

      // Find the canvas element
      const canvas = this.page.locator('canvas').first();
      const canvasVisible = await canvas.isVisible().catch(() => false);

      if (canvasVisible) {
        logger.info('Found canvas-based seat layout, using coordinate clicks');
        return await this.selectSeatsOnCanvas(count);
      }

      // Fallback to DOM-based selection if no canvas
      return await this.selectSeatsDOMBased(count);
    } catch (error) {
      logger.error('BMS seat selection error', { error });
      return null;
    }
  }

  /**
   * Select seats on canvas-based seat layout by clicking coordinates
   */
  async selectSeatsOnCanvas(count: number): Promise<SeatGroup | null> {
    try {
      const canvas = this.page.locator('canvas').first();
      const boundingBox = await canvas.boundingBox();

      if (!boundingBox) {
        logger.warn('Could not get canvas bounding box');
        return null;
      }

      logger.info('Canvas dimensions', {
        x: boundingBox.x,
        y: boundingBox.y,
        width: boundingBox.width,
        height: boundingBox.height,
      });

      // BMS seat layout structure (based on observed screenshots):
      // - Rows are labeled A-Q on the left
      // - Seat numbers increase from left to right
      // - Seats are small boxes (~18-20px) with gaps between sections
      // - The canvas coordinate system may be scaled

      const selectedIds: string[] = [];

      // Try multiple row positions to find available seats
      // Row positions as percentage of canvas height (approximate):
      // Row C-D (Gold section upper): ~25%
      // Row G-H (Gold section middle): ~40%
      // Row K-L (middle section): ~52%
      // Row N-O (lower section): ~62%

      const rowPositions = [0.52, 0.40, 0.62, 0.35, 0.55]; // K, G, N, F, L rows approximately

      // Seat positions - try center-right area where seats are usually available
      // Based on screenshot: seats 10-12 are around 53-58% of width
      const seatSpacing = 21; // pixels between seat centers
      const centerSeatX = boundingBox.x + boundingBox.width * 0.54; // Around seat 10-11

      for (const rowOffset of rowPositions) {
        const rowY = boundingBox.y + boundingBox.height * rowOffset;

        // Clear any previous selection by clicking elsewhere
        await this.page.mouse.click(boundingBox.x + 50, boundingBox.y + 50);
        await this.page.waitForTimeout(200);

        logger.info('Trying row position', { rowOffset, y: rowY });

        // Click on seats in this row
        for (let i = 0; i < count; i++) {
          const clickX = centerSeatX + i * seatSpacing;
          const clickY = rowY;

          logger.debug('Clicking seat position', { x: clickX, y: clickY, seatNum: i + 1 });
          await this.page.mouse.click(clickX, clickY);
          await this.page.waitForTimeout(400);
        }

        // Check if seats were selected by looking for Pay button with price
        // The Pay button should contain "Pay ₹ XXX" pattern (specific price)
        await this.page.waitForTimeout(1000);

        const hasPayButton = await this.page.evaluate(() => {
          // Look for the specific Pay button at the bottom of the screen
          // It should have format "Pay ₹ XXX" with a specific price number
          const allElements = document.querySelectorAll('*');
          for (const el of allElements) {
            const text = (el as HTMLElement).textContent?.trim() || '';
            // Match "Pay ₹ 590" or "Pay ₹590" or "Pay Rs 590" patterns
            // The price should be a 3-4 digit number for movie tickets
            if (/Pay\s*[₹Rs\.]*\s*\d{3,4}/.test(text)) {
              // Make sure it's a small focused element (the button itself), not a container
              if (text.length < 20) {
                return true;
              }
            }
          }
          return false;
        });

        if (hasPayButton) {
          logger.info('Seats selected successfully at row offset', { rowOffset });
          for (let i = 0; i < count; i++) {
            selectedIds.push(`canvas-seat-${i + 1}`);
          }
          break;
        }

        logger.debug('No seats selected at this row, trying next');
      }

      // If still no success, try a grid search
      if (selectedIds.length === 0) {
        logger.info('Grid search for available seats');

        // Try clicking at different X positions too
        const xOffsets = [0.48, 0.52, 0.56, 0.60, 0.44]; // Different horizontal positions

        for (const yOffset of [0.50, 0.45, 0.55, 0.40, 0.60]) {
          for (const xOffset of xOffsets) {
            // Reset selection
            await this.page.mouse.click(boundingBox.x + 50, boundingBox.y + 50);
            await this.page.waitForTimeout(150);

            const clickY = boundingBox.y + boundingBox.height * yOffset;
            const baseX = boundingBox.x + boundingBox.width * xOffset;

            // Click count seats
            for (let i = 0; i < count; i++) {
              await this.page.mouse.click(baseX + i * seatSpacing, clickY);
              await this.page.waitForTimeout(300);
            }

            await this.page.waitForTimeout(800);

            const hasPayButton = await this.page.evaluate(() => {
              // Look for the specific Pay button with price pattern
              const allElements = document.querySelectorAll('*');
              for (const el of allElements) {
                const text = (el as HTMLElement).textContent?.trim() || '';
                if (/Pay\s*[₹Rs\.]*\s*\d{3,4}/.test(text) && text.length < 20) {
                  return true;
                }
              }
              return false;
            });

            if (hasPayButton) {
              logger.info('Seats found via grid search', { xOffset, yOffset });
              for (let i = 0; i < count; i++) {
                selectedIds.push(`canvas-seat-${i + 1}`);
              }
              break;
            }
          }
          if (selectedIds.length > 0) break;
        }
      }

      // Take a debug screenshot to see the current state
      try {
        await this.page.screenshot({ path: 'screenshots/debug/after-seat-clicks.png', fullPage: false });
        logger.debug('Saved screenshot after seat clicks');
      } catch {
        // Ignore screenshot errors
      }

      // Check if we successfully selected seats
      if (selectedIds.length > 0) {
        logger.info('Seats selected successfully', { count: selectedIds.length });

        const mockSeats: Seat[] = selectedIds.map((id, index) => ({
          id,
          row: 'X',
          number: index + 1,
          status: 'available' as const,
          price: 0,
        }));

        this.selectedSeats = mockSeats;

        return {
          seats: mockSeats,
          avgScore: 0.7,
          totalPrice: 0,
        };
      }

      logger.warn('Could not select seats on canvas after multiple attempts');
      return null;
    } catch (error) {
      logger.error('Canvas seat selection error', { error });
      return null;
    }
  }

  /**
   * DOM-based seat selection fallback
   */
  async selectSeatsDOMBased(count: number): Promise<SeatGroup | null> {
    try {
      logger.info('Attempting DOM-based seat selection');

      const result = await this.page.evaluate((seatCount: number) => {
        // Find all potential seat elements
        const allElements = document.querySelectorAll('[class*="sc-fdng8-10"], [class*="sc-fdng8-8"]');
        const availableSeats: HTMLElement[] = [];

        allElements.forEach((el) => {
          const htmlEl = el as HTMLElement;
          if (htmlEl.offsetWidth > 0 && htmlEl.offsetHeight > 0) {
            const rect = htmlEl.getBoundingClientRect();
            if (rect.width > 10 && rect.width < 40 && rect.height > 10 && rect.height < 40) {
              availableSeats.push(htmlEl);
            }
          }
        });

        if (availableSeats.length === 0) {
          return { success: false, error: 'No available seats found', selected: [] };
        }

        availableSeats.sort((a, b) => {
          const rectA = a.getBoundingClientRect();
          const rectB = b.getBoundingClientRect();
          const viewportCenter = window.innerWidth / 2;
          return Math.abs(rectA.left - viewportCenter) - Math.abs(rectB.left - viewportCenter);
        });

        const selectedIds: string[] = [];
        let clickedCount = 0;

        for (const seat of availableSeats) {
          if (clickedCount >= seatCount) break;
          try {
            seat.click();
            clickedCount++;
            selectedIds.push(`seat-${clickedCount}`);
          } catch {
            continue;
          }
        }

        return {
          success: clickedCount >= seatCount,
          selected: selectedIds,
          error: clickedCount < seatCount ? `Only ${clickedCount} seats selected` : undefined,
        };
      }, count);

      if (result.success && result.selected.length > 0) {
        logger.info('DOM seat selection successful', { selected: result.selected });

        const mockSeats: Seat[] = result.selected.map((id, index) => ({
          id,
          row: 'X',
          number: index + 1,
          status: 'available' as const,
          price: 0,
        }));

        this.selectedSeats = mockSeats;

        return {
          seats: mockSeats,
          avgScore: 0.7,
          totalPrice: 0,
        };
      }

      logger.warn('DOM seat selection failed', { result });
      return null;
    } catch (error) {
      logger.error('DOM seat selection error', { error });
      return null;
    }
  }

  async clickSeat(seatId: string): Promise<boolean> {
    try {
      const parts = seatId.split('-');
      const row = parts[0];
      const seatNum = parts[1];

      if (!row || !seatNum) {
        logger.error('Invalid seat ID format', { seatId });
        return false;
      }

      const selectors = [
        `[data-seat-id="${seatId}"]`,
        `[data-id="${seatId}"]`,
        `#seat-${seatId}`,
        `.seat[data-seat="${seatNum}"][data-row="${row}"]`,
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
    try {
      const selected = this.page.locator('.seat--selected, [data-selected="true"]');
      return await selected.count();
    } catch (error) {
      logger.error('Failed to get selected count', { error });
      return 0;
    }
  }

  async getTotalPrice(): Promise<number> {
    try {
      const priceText = await this.getText('.total-amount, .total-price');
      const match = priceText.match(/[\d,]+/);
      return match ? parseInt(match[0].replace(/,/g, '')) : 0;
    } catch (error) {
      logger.debug('Failed to get total price', { error });
      return 0;
    }
  }

  async proceedToPayment(): Promise<boolean> {
    try {
      logger.info('Looking for Pay/Proceed button');

      // Wait a moment for UI to settle after seat selection
      await this.page.waitForTimeout(1000);

      // Try multiple selectors for the pay button - BMS uses various patterns
      const payButtonSelectors = [
        // BMS styled-component patterns for Pay button
        '[class*="sc-"] >> text=/Pay/i',
        '[class*="pay-button"]',
        '[class*="payBtn"]',
        // Text-based selectors
        'text=/Pay\\s*₹\\s*\\d+/i',
        'text=/Pay Rs/i',
        'div:has-text("Pay ₹")',
        'button:has-text("Pay")',
        'button:has-text("Proceed")',
        // Role-based
        'button >> text=/Pay/i',
        this.selectors.proceedButton,
      ];

      for (const selector of payButtonSelectors) {
        try {
          const btn = this.page.locator(selector).first();
          if (await btn.isVisible().catch(() => false)) {
            logger.info('Found pay button', { selector });
            await btn.click();
            await this.waitForLoad();
            return true;
          }
        } catch {
          continue;
        }
      }

      // Try using getByText which is more robust
      const payByText = this.page.getByText(/Pay\s*₹\s*\d+/i).first();
      if (await payByText.isVisible().catch(() => false)) {
        logger.info('Found pay button via getByText');
        await payByText.click();
        await this.waitForLoad();
        return true;
      }

      // Fallback: Use JavaScript to find and click Pay button with MouseEvent
      const clicked = await this.page.evaluate(() => {
        // First try to find elements containing "Pay" and a price
        const allElements = document.querySelectorAll('*');
        let payButton: HTMLElement | null = null;

        for (const el of allElements) {
          const htmlEl = el as HTMLElement;
          // Get direct text content (not including children)
          const directText = htmlEl.textContent || '';

          // Look for "Pay ₹ XXX" pattern
          if (directText.match(/Pay\s*₹\s*\d+/) || directText.match(/Pay Rs\.?\s*\d+/)) {
            // Prefer the most specific (smallest) element containing the text
            if (!payButton || htmlEl.textContent!.length < payButton.textContent!.length) {
              payButton = htmlEl;
            }
          }
        }

        if (payButton) {
          // Use MouseEvent for proper React event handling
          const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          payButton.dispatchEvent(event);
          return 'found-pay-button';
        }

        // Also try looking for fixed/sticky footer elements with Pay text
        const fixedElements = document.querySelectorAll('[style*="fixed"], [style*="sticky"], [class*="footer"], [class*="bottom"]');
        for (const el of fixedElements) {
          const htmlEl = el as HTMLElement;
          if (htmlEl.textContent?.includes('Pay')) {
            // Find clickable child
            const clickable = htmlEl.querySelector('div, button, a');
            if (clickable) {
              const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
              });
              clickable.dispatchEvent(event);
              return 'found-in-footer';
            }
          }
        }

        return false;
      });

      if (clicked) {
        logger.info('Clicked Pay button via JS', { method: clicked });
        await this.waitForLoad();
        return true;
      }

      // Last resort: Try clicking at the bottom of the viewport where Pay button typically is
      logger.info('Trying to click Pay button by viewport position');
      const viewport = this.page.viewportSize();
      if (viewport) {
        // BMS Pay button is typically at the bottom center
        const payButtonX = viewport.width / 2;
        const payButtonY = viewport.height - 50; // 50px from bottom

        await this.page.mouse.click(payButtonX, payButtonY);
        await this.page.waitForTimeout(2000);

        // Check if we navigated away from seat-layout
        const currentUrl = this.page.url();
        if (!currentUrl.includes('seat-layout')) {
          logger.info('Successfully navigated from seat page');
          return true;
        }
      }

      logger.error('Pay button not found');
      return false;
    } catch (error) {
      logger.error('Failed to proceed to payment', { error });
      return false;
    }
  }

  getSelectedSeats(): Seat[] {
    return this.selectedSeats;
  }
}
