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
    } catch (error) {
      logger.error('Failed to select optimal seats', { error });
      return null;
    }
  }

  async clickSeat(seatId: string): Promise<boolean> {
    try {
      const [row, seatNum] = seatId.split('-');
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
      const proceedBtn = this.page.locator(this.selectors.proceedButton);
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
