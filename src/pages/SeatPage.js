/**
 * SeatPage - Seat Selection Logic
 * 
 * LEARNING CONCEPT: Complex State & Algorithm Implementation
 * -----------------------------------------------------------
 * This page demonstrates:
 * 1. Grid-based element analysis
 * 2. Algorithm implementation (finding optimal seats)
 * 3. State management during selection
 * 4. Handling interactive UI components
 */

import { BasePage } from './BasePage.js';

export class SeatPage extends BasePage {
  constructor(page) {
    super(page);
    
    this.selectors = {
      // Container
      seatLayoutContainer: '[data-testid="seat-layout"]',
      screenIndicator: '[data-testid="screen"]',
      
      // Seats
      seat: '[data-testid="seat"]',
      seatAvailable: '[data-testid="seat"].available',
      seatUnavailable: '[data-testid="seat"].unavailable, [data-testid="seat"].sold',
      seatSelected: '[data-testid="seat"].selected',
      seatRow: '[data-testid="seat-row"]',
      rowLabel: '[data-testid="row-label"]',
      
      // Seat categories
      categoryLegend: '[data-testid="seat-legend"]',
      categoryItem: '[data-testid="legend-item"]',
      primeSeats: '[data-testid="seat"][data-category="prime"]',
      classicSeats: '[data-testid="seat"][data-category="classic"]',
      reclinerSeats: '[data-testid="seat"][data-category="recliner"]',
      
      // Pricing
      priceBreakdown: '[data-testid="price-breakdown"]',
      totalPrice: '[data-testid="total-price"]',
      seatPrice: '[data-testid="seat-price"]',
      
      // Actions
      proceedButton: '[data-testid="proceed-btn"], button:has-text("Proceed")',
      clearSelection: '[data-testid="clear-btn"]',
      
      // Messages
      maxSeatsWarning: '[data-testid="max-seats-warning"]',
      selectionInfo: '[data-testid="selection-info"]',
      
      // Loading
      seatLoading: '[data-testid="seats-loading"]',
    };
    
    // Track selected seats
    this.selectedSeats = [];
  }

  // ============================================
  // PAGE LOAD
  // ============================================

  async waitForLoad() {
    this.log('Waiting for seat layout to load');
    
    try {
      await this.waitForSelectorToDisappear(this.selectors.seatLoading, 15000);
    } catch {
      // Loading might not exist
    }
    
    await this.waitForSelector(this.selectors.seatLayoutContainer);
    
    // Extra wait for seat rendering
    await this.sleep(this.config.timing.preSelectionDelay);
    
    this.log('Seat layout loaded');
  }

  // ============================================
  // SEAT DATA EXTRACTION
  // ============================================

  /**
   * Get the complete seat map
   * 
   * LEARNING: Parsing grid-based layouts into data structures
   */
  async getSeatMap() {
    const seatMap = {
      rows: [],
      totalSeats: 0,
      availableSeats: 0,
      categories: {},
    };
    
    const rows = await this.getAll(this.selectors.seatRow);
    
    for (const row of rows) {
      const rowData = await this.parseRow(row);
      seatMap.rows.push(rowData);
      seatMap.totalSeats += rowData.seats.length;
      seatMap.availableSeats += rowData.seats.filter(s => s.isAvailable).length;
    }
    
    // Get category info
    seatMap.categories = await this.getCategories();
    
    return seatMap;
  }

  /**
   * Parse a single row
   */
  async parseRow(rowElement) {
    const label = await rowElement.locator(this.selectors.rowLabel).textContent().catch(() => '?');
    const seatElements = await rowElement.locator(this.selectors.seat).all();
    
    const seats = [];
    let columnIndex = 0;
    
    for (const seatEl of seatElements) {
      const seatData = await this.parseSeat(seatEl, label?.trim(), columnIndex);
      seats.push(seatData);
      columnIndex++;
    }
    
    return {
      label: label?.trim(),
      seats,
      totalInRow: seats.length,
      availableInRow: seats.filter(s => s.isAvailable).length,
    };
  }

  /**
   * Parse a single seat element
   */
  async parseSeat(seatElement, rowLabel, columnIndex) {
    const seatNumber = await seatElement.getAttribute('data-seat') || 
                       await seatElement.textContent() || 
                       String(columnIndex + 1);
    
    const classes = await seatElement.getAttribute('class') || '';
    const category = await seatElement.getAttribute('data-category') || 'standard';
    const price = await seatElement.getAttribute('data-price');
    
    return {
      id: `${rowLabel}-${seatNumber}`,
      row: rowLabel,
      number: seatNumber.trim(),
      columnIndex,
      isAvailable: classes.includes('available') && !classes.includes('sold'),
      isSelected: classes.includes('selected'),
      category,
      price: price ? parseInt(price) : null,
      element: seatElement,
    };
  }

  /**
   * Get category/pricing info from legend
   */
  async getCategories() {
    const categories = {};
    const items = await this.getAll(this.selectors.categoryItem);
    
    for (const item of items) {
      const name = await item.getAttribute('data-category');
      const priceText = await item.locator(this.selectors.seatPrice).textContent().catch(() => '');
      const price = this.parsePrice(priceText);
      
      if (name) {
        categories[name] = { price };
      }
    }
    
    return categories;
  }

  parsePrice(priceStr) {
    if (!priceStr) return null;
    const match = priceStr.match(/[\d,]+/);
    return match ? parseInt(match[0].replace(',', '')) : null;
  }

  // ============================================
  // SEAT SELECTION ALGORITHMS
  // ============================================

  /**
   * Find optimal seats based on preferences
   * 
   * LEARNING: Algorithm for finding best consecutive seats in center
   */
  async findOptimalSeats(count) {
    const seatMap = await this.getSeatMap();
    const preferences = this.config.seats;
    
    this.log(`Finding ${count} optimal seats with preference: ${preferences.preference}`);
    
    // Get candidate rows based on preference
    const candidateRows = this.getCandidateRows(seatMap, preferences);
    
    for (const row of candidateRows) {
      const seats = this.findBestSeatsInRow(row, count, preferences);
      if (seats) {
        this.log(`Found optimal seats: ${seats.map(s => s.id).join(', ')}`);
        return seats;
      }
    }
    
    // Fallback: find any available consecutive seats
    this.log('No optimal seats found, falling back to any available');
    return this.findAnyConsecutiveSeats(seatMap, count);
  }

  /**
   * Get rows to check based on preference
   */
  getCandidateRows(seatMap, preferences) {
    const allRows = seatMap.rows;
    
    // Filter to rows with enough available seats
    const viableRows = allRows.filter(row => 
      row.availableInRow >= preferences.count
    );
    
    // Sort by preferred rows
    const preferredRowLabels = preferences.preferredRows;
    
    return viableRows.sort((a, b) => {
      const aIndex = preferredRowLabels.indexOf(a.label);
      const bIndex = preferredRowLabels.indexOf(b.label);
      
      // Preferred rows come first
      if (aIndex !== -1 && bIndex === -1) return -1;
      if (aIndex === -1 && bIndex !== -1) return 1;
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      
      // Otherwise, middle rows are better
      const midRow = allRows.length / 2;
      const aDistFromMid = Math.abs(allRows.indexOf(a) - midRow);
      const bDistFromMid = Math.abs(allRows.indexOf(b) - midRow);
      return aDistFromMid - bDistFromMid;
    });
  }

  /**
   * Find the best seats in a single row
   * 
   * LEARNING: Sliding window + scoring algorithm
   */
  findBestSeatsInRow(row, count, preferences) {
    const seats = row.seats;
    const availableSeats = seats.filter(s => s.isAvailable);
    
    if (availableSeats.length < count) return null;
    
    if (preferences.mustBeConsecutive) {
      return this.findBestConsecutiveSeats(seats, count, preferences);
    } else {
      return this.findBestNonConsecutiveSeats(seats, count, preferences);
    }
  }

  /**
   * Find best consecutive seats (sliding window approach)
   */
  findBestConsecutiveSeats(seats, count, preferences) {
    let bestGroup = null;
    let bestScore = -Infinity;
    
    // Find all consecutive available groups
    for (let i = 0; i <= seats.length - count; i++) {
      const group = seats.slice(i, i + count);
      
      // Check if all seats are available
      if (!group.every(s => s.isAvailable)) continue;
      
      // Check category if specified
      if (preferences.category !== 'any') {
        if (!group.every(s => s.category === preferences.category.toLowerCase())) {
          continue;
        }
      }
      
      // Check price limit
      if (preferences.maxPricePerTicket > 0) {
        if (group.some(s => s.price && s.price > preferences.maxPricePerTicket)) {
          continue;
        }
      }
      
      // Score this group
      const score = this.scoreGroup(group, seats.length, preferences);
      
      if (score > bestScore) {
        bestScore = score;
        bestGroup = group;
      }
    }
    
    return bestGroup;
  }

  /**
   * Score a group of seats (higher = better)
   * 
   * LEARNING: Multi-factor scoring
   */
  scoreGroup(group, totalInRow, preferences) {
    let score = 0;
    
    // Calculate how centered the group is
    const groupCenter = group.reduce((sum, s) => sum + s.columnIndex, 0) / group.length;
    const rowCenter = totalInRow / 2;
    const centerDistance = Math.abs(groupCenter - rowCenter);
    
    // Center preference: closer to center = higher score
    if (preferences.preference === 'center') {
      score += (totalInRow / 2 - centerDistance) * 10;
    }
    
    // Aisle preference: closer to edges = higher score
    if (preferences.preference === 'aisle') {
      const minEdgeDistance = Math.min(
        group[0].columnIndex,
        totalInRow - group[group.length - 1].columnIndex - 1
      );
      score += (totalInRow / 2 - minEdgeDistance) * 10;
    }
    
    // Penalty for split groups (gap between seats)
    const hasGap = group.some((s, i) => 
      i > 0 && s.columnIndex - group[i-1].columnIndex > 1
    );
    if (hasGap) score -= 50;
    
    return score;
  }

  /**
   * Find any consecutive seats (fallback)
   */
  findAnyConsecutiveSeats(seatMap, count) {
    for (const row of seatMap.rows) {
      for (let i = 0; i <= row.seats.length - count; i++) {
        const group = row.seats.slice(i, i + count);
        if (group.every(s => s.isAvailable)) {
          return group;
        }
      }
    }
    return null;
  }

  /**
   * Find non-consecutive seats (when consecutive not required)
   */
  findBestNonConsecutiveSeats(seats, count, preferences) {
    const available = seats.filter(s => s.isAvailable);
    
    if (available.length < count) return null;
    
    // Sort by closeness to center
    const rowCenter = seats.length / 2;
    const sorted = [...available].sort((a, b) => {
      const aDist = Math.abs(a.columnIndex - rowCenter);
      const bDist = Math.abs(b.columnIndex - rowCenter);
      return aDist - bDist;
    });
    
    return sorted.slice(0, count);
  }

  // ============================================
  // SEAT SELECTION ACTIONS
  // ============================================

  /**
   * Select specific seats
   */
  async selectSeats(seats) {
    this.log(`Selecting ${seats.length} seats`);
    
    for (const seat of seats) {
      await this.selectSeat(seat);
    }
    
    // Verify selection
    const selectedCount = await this.count(this.selectors.seatSelected);
    
    if (selectedCount !== seats.length) {
      throw new Error(`Selection mismatch: expected ${seats.length}, got ${selectedCount}`);
    }
    
    this.selectedSeats = seats;
    return true;
  }

  /**
   * Select a single seat
   */
  async selectSeat(seat) {
    await seat.element.scrollIntoViewIfNeeded();
    await seat.element.click();
    
    // Wait for selection animation
    await this.sleep(300);
    
    this.log(`Selected seat: ${seat.id}`);
  }

  /**
   * Clear current selection
   */
  async clearSelection() {
    if (await this.isVisible(this.selectors.clearSelection)) {
      await this.click(this.selectors.clearSelection);
      await this.sleep(500);
    }
    this.selectedSeats = [];
  }

  /**
   * Main method: find and select optimal seats
   */
  async selectOptimalSeats() {
    const count = this.config.seats.count;
    
    // Find optimal seats
    const optimalSeats = await this.findOptimalSeats(count);
    
    if (!optimalSeats) {
      this.log('Could not find suitable seats');
      return false;
    }
    
    // Select them
    await this.selectSeats(optimalSeats);
    
    return true;
  }

  // ============================================
  // PROCEED TO PAYMENT
  // ============================================

  /**
   * Get total price for selected seats
   */
  async getTotalPrice() {
    const priceText = await this.getText(this.selectors.totalPrice);
    return this.parsePrice(priceText);
  }

  /**
   * Proceed to payment
   */
  async proceedToPayment() {
    const totalPrice = await this.getTotalPrice();
    this.log(`Proceeding to payment. Total: ₹${totalPrice}`);
    
    await this.click(this.selectors.proceedButton);
    await this.waitForNavigation();
    
    return totalPrice;
  }

  // ============================================
  // DIAGNOSTICS
  // ============================================

  /**
   * Log seat layout for debugging
   */
  async logSeatLayout() {
    const seatMap = await this.getSeatMap();
    
    console.log('\n=== Seat Layout ===');
    console.log(`Total seats: ${seatMap.totalSeats}`);
    console.log(`Available: ${seatMap.availableSeats}`);
    console.log('\nLayout:');
    
    for (const row of seatMap.rows) {
      const seatDisplay = row.seats.map(s => {
        if (s.isSelected) return '[X]';
        if (s.isAvailable) return '[ ]';
        return '[■]';
      }).join('');
      
      console.log(`${row.label.padStart(2)}: ${seatDisplay}`);
    }
    
    console.log('\nLegend: [ ]=Available, [■]=Sold, [X]=Selected');
    console.log('========================\n');
  }
}

export default SeatPage;
