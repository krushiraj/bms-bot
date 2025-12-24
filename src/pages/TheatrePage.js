/**
 * TheatrePage - Theatre and Showtime Selection
 * 
 * LEARNING CONCEPT: Complex List Navigation
 * ------------------------------------------
 * This page demonstrates:
 * 1. Parsing structured data from the DOM
 * 2. Priority-based selection algorithms
 * 3. Handling dynamically loaded content
 */

import { BasePage } from './BasePage.js';

export class TheatrePage extends BasePage {
  constructor(page) {
    super(page);
    
    this.selectors = {
      // Page container
      theatreListContainer: '[data-testid="theatre-list"]',
      
      // Theatre elements
      theatreCard: '[data-testid="theatre-card"]',
      theatreName: '[data-testid="theatre-name"]',
      theatreAddress: '[data-testid="theatre-address"]',
      theatreDistance: '[data-testid="theatre-distance"]',
      theatreAmenities: '[data-testid="theatre-amenities"]',
      
      // Showtime elements
      showtimeContainer: '[data-testid="showtimes"]',
      showtimeButton: '[data-testid="showtime-btn"]',
      showtimeDisabled: '[data-testid="showtime-btn"].disabled',
      showtimePrice: '[data-testid="showtime-price"]',
      
      // Format/Language info
      formatBadge: '[data-testid="format-badge"]',
      languageBadge: '[data-testid="language-badge"]',
      
      // Categories
      categorySection: '[data-testid="category-section"]',
      categoryName: '[data-testid="category-name"]',
      
      // Loading
      loadingOverlay: '[data-testid="loading-overlay"]',
      noShowsMessage: '[data-testid="no-shows"]',
      
      // Date navigation
      dateSlider: '[data-testid="date-slider"]',
      dateItem: '[data-testid="date-item"]',
      activeDateItem: '[data-testid="date-item"].active',
    };
  }

  // ============================================
  // PAGE LOAD
  // ============================================

  /**
   * Wait for theatre listings to load
   */
  async waitForLoad() {
    this.log('Waiting for theatre list to load');
    
    // Wait for loading to finish
    try {
      await this.waitForSelectorToDisappear(this.selectors.loadingOverlay, 10000);
    } catch {
      // Overlay might not exist
    }
    
    // Wait for theatres or "no shows" message
    await this.page.waitForSelector(
      `${this.selectors.theatreCard}, ${this.selectors.noShowsMessage}`,
      { timeout: 15000 }
    );
    
    // Check if shows are available
    if (await this.isVisible(this.selectors.noShowsMessage)) {
      this.log('No shows available for selected criteria');
      return false;
    }
    
    this.log('Theatre list loaded');
    return true;
  }

  // ============================================
  // DATA EXTRACTION
  // ============================================

  /**
   * Get all available theatres with their showtimes
   * 
   * LEARNING: Extracting structured data from complex DOM
   */
  async getAllTheatres() {
    const theatres = [];
    const theatreCards = await this.getAll(this.selectors.theatreCard);
    
    this.log(`Found ${theatreCards.length} theatres`);
    
    for (const card of theatreCards) {
      const theatre = await this.parseTheatreCard(card);
      if (theatre) {
        theatres.push(theatre);
      }
    }
    
    return theatres;
  }

  /**
   * Parse a single theatre card
   */
  async parseTheatreCard(card) {
    try {
      // Get theatre info
      const name = await card.locator(this.selectors.theatreName).textContent();
      const address = await card.locator(this.selectors.theatreAddress).textContent().catch(() => '');
      
      // Get showtimes
      const showtimes = await this.parseShowtimes(card);
      
      // Get amenities
      const amenities = await card.locator(this.selectors.theatreAmenities).textContent().catch(() => '');
      
      return {
        name: name?.trim(),
        address: address?.trim(),
        amenities: amenities?.split(',').map(a => a.trim()) || [],
        showtimes,
        cardElement: card,
      };
    } catch (error) {
      this.logError('Error parsing theatre card', error);
      return null;
    }
  }

  /**
   * Parse showtimes from a theatre card
   */
  async parseShowtimes(theatreCard) {
    const showtimes = [];
    const showtimeButtons = await theatreCard.locator(this.selectors.showtimeButton).all();
    
    for (const btn of showtimeButtons) {
      const time = await btn.textContent();
      const isDisabled = await btn.isDisabled();
      const price = await btn.locator(this.selectors.showtimePrice).textContent().catch(() => null);
      const format = await btn.getAttribute('data-format') || '2D';
      
      showtimes.push({
        time: time?.trim(),
        isAvailable: !isDisabled,
        price: this.parsePrice(price),
        format,
        element: btn,
      });
    }
    
    return showtimes;
  }

  /**
   * Parse price string to number
   */
  parsePrice(priceStr) {
    if (!priceStr) return null;
    const match = priceStr.match(/[\d,]+/);
    return match ? parseInt(match[0].replace(',', '')) : null;
  }

  // ============================================
  // SELECTION LOGIC
  // ============================================

  /**
   * Find the best theatre and showtime based on preferences
   * 
   * LEARNING: Priority-based selection algorithm
   */
  async findBestOption() {
    const theatres = await this.getAllTheatres();
    const preferences = this.config;
    
    // Try theatres in preference order
    for (const preferredTheatre of preferences.theatres.preferred) {
      const theatre = this.findMatchingTheatre(theatres, preferredTheatre);
      
      if (theatre) {
        // Find matching showtime
        const showtime = this.findMatchingShowtime(theatre.showtimes, preferences);
        
        if (showtime) {
          return { theatre, showtime };
        }
      }
    }
    
    // No preferred theatre found, try to find any match
    this.log('No preferred theatre available, checking all options');
    
    for (const theatre of theatres) {
      const showtime = this.findMatchingShowtime(theatre.showtimes, preferences);
      if (showtime) {
        return { theatre, showtime };
      }
    }
    
    return null;
  }

  /**
   * Find a theatre matching the preference
   */
  findMatchingTheatre(theatres, preferredName) {
    return theatres.find(t => 
      t.name?.toLowerCase().includes(preferredName.toLowerCase())
    );
  }

  /**
   * Find the best matching showtime
   */
  findMatchingShowtime(showtimes, preferences) {
    // Filter to available showtimes only
    const available = showtimes.filter(s => s.isAvailable);
    
    if (available.length === 0) return null;
    
    // Filter by preferred times
    const preferredTimes = preferences.movie.preferredShowtimes;
    
    for (const preferredTime of preferredTimes) {
      const match = available.find(s => 
        this.timesMatch(s.time, preferredTime)
      );
      if (match) return match;
    }
    
    // No preferred time, return first available
    return available[0];
  }

  /**
   * Check if two time strings match
   */
  timesMatch(time1, time2) {
    if (!time1 || !time2) return false;
    
    // Normalize both times for comparison
    const normalize = (t) => t.replace(/\s/g, '').toLowerCase();
    return normalize(time1) === normalize(time2);
  }

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Select a specific theatre and showtime
   */
  async selectShowtime(theatre, showtime) {
    this.log(`Selecting: ${theatre.name} - ${showtime.time}`);
    
    // Scroll theatre into view
    await theatre.cardElement.scrollIntoViewIfNeeded();
    
    // Click the showtime button
    await showtime.element.click();
    
    // Wait for navigation to seat selection
    await this.waitForNavigation();
    
    return true;
  }

  /**
   * Main selection method - find and select the best option
   */
  async selectBestOption() {
    const best = await this.findBestOption();
    
    if (!best) {
      this.log('No matching theatre/showtime found');
      return false;
    }
    
    this.log(`Best option found: ${best.theatre.name} at ${best.showtime.time}`);
    return await this.selectShowtime(best.theatre, best.showtime);
  }

  // ============================================
  // DATE NAVIGATION
  // ============================================

  /**
   * Navigate to a different date
   */
  async selectDate(targetDate) {
    const dateItems = await this.getAll(this.selectors.dateItem);
    
    for (const item of dateItems) {
      const dateStr = await item.getAttribute('data-date');
      if (dateStr === targetDate) {
        await item.click();
        await this.waitForLoad();
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get available dates
   */
  async getAvailableDates() {
    const dates = [];
    const dateItems = await this.getAll(this.selectors.dateItem);
    
    for (const item of dateItems) {
      const dateStr = await item.getAttribute('data-date');
      const label = await item.textContent();
      dates.push({ date: dateStr, label: label?.trim() });
    }
    
    return dates;
  }

  // ============================================
  // FILTERING
  // ============================================

  /**
   * Filter theatres to only show specific category
   */
  async filterByCategory(category) {
    const categorySelectors = await this.getAll(this.selectors.categorySection);
    
    for (const section of categorySelectors) {
      const name = await section.locator(this.selectors.categoryName).textContent();
      if (name?.toLowerCase().includes(category.toLowerCase())) {
        await section.click();
        await this.sleep(500);
        return true;
      }
    }
    
    return false;
  }

  // ============================================
  // DIAGNOSTICS
  // ============================================

  /**
   * Log all available options (for debugging)
   */
  async logAvailableOptions() {
    const theatres = await this.getAllTheatres();
    
    console.log('\n=== Available Options ===');
    for (const theatre of theatres) {
      console.log(`\n🎬 ${theatre.name}`);
      console.log(`   📍 ${theatre.address}`);
      
      const availableShowtimes = theatre.showtimes.filter(s => s.isAvailable);
      console.log(`   🕐 Showtimes: ${availableShowtimes.map(s => s.time).join(', ')}`);
    }
    console.log('\n========================\n');
  }
}

export default TheatrePage;
