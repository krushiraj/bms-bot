/**
 * HomePage - Movie Search and Selection
 * 
 * LEARNING CONCEPT: Page-Specific Selectors and Actions
 * -----------------------------------------------------
 * Each page class encapsulates:
 * 1. Selectors specific to that page
 * 2. Actions a user can perform on that page
 * 3. Validations/assertions for that page
 */

import { BasePage } from './BasePage.js';

export class HomePage extends BasePage {
  constructor(page) {
    super(page);
    
    // ============================================
    // SELECTORS
    // ============================================
    // LEARNING: Keep all selectors in one place
    // Makes updates easy when UI changes
    
    this.selectors = {
      // Search elements
      searchInput: '[data-testid="search-input"], input[placeholder*="Search"]',
      searchButton: '[data-testid="search-button"], button[aria-label="Search"]',
      searchSuggestions: '[data-testid="search-suggestions"]',
      searchSuggestionItem: '[data-testid="suggestion-item"]',
      
      // Movie cards/list
      movieCard: '[data-testid="movie-card"]',
      movieTitle: '[data-testid="movie-title"]',
      moviePoster: '[data-testid="movie-poster"]',
      movieRating: '[data-testid="movie-rating"]',
      movieGenre: '[data-testid="movie-genre"]',
      movieLanguage: '[data-testid="movie-language"]',
      
      // Book button
      bookButton: '[data-testid="book-button"], button:has-text("Book")',
      
      // Date picker
      datePicker: '[data-testid="date-picker"]',
      dateOption: '[data-testid="date-option"]',
      selectedDate: '[data-testid="date-option"].selected',
      
      // Location
      locationButton: '[data-testid="location-button"]',
      locationInput: '[data-testid="location-input"]',
      locationOption: '[data-testid="location-option"]',
      
      // Filters
      filterSection: '[data-testid="filters"]',
      languageFilter: '[data-testid="language-filter"]',
      formatFilter: '[data-testid="format-filter"]',
      
      // Loading states
      loadingSpinner: '[data-testid="loading"], .loading-spinner',
      skeleton: '.skeleton, [data-testid="skeleton"]',
    };
  }

  // ============================================
  // NAVIGATION
  // ============================================

  /**
   * Navigate to the home page
   */
  async navigate() {
    const baseUrl = this.config.mockSite.enabled 
      ? this.config.mockSite.baseUrl 
      : 'https://example-booking-site.com';
    
    await this.goto(baseUrl);
    await this.waitForPageLoad();
  }

  /**
   * Wait for home page to fully load
   */
  async waitForPageLoad() {
    // Wait for loading indicators to disappear
    try {
      await this.waitForSelectorToDisappear(this.selectors.loadingSpinner, 5000);
    } catch {
      // Loading spinner might not exist, continue
    }
    
    // Wait for movie cards to appear
    await this.waitForSelector(this.selectors.movieCard);
    this.log('Home page loaded');
  }

  // ============================================
  // SEARCH FUNCTIONALITY
  // ============================================

  /**
   * Search for a movie by name
   * 
   * LEARNING: Chaining multiple actions with proper waits
   */
  async searchMovie(movieName) {
    this.log(`Searching for movie: ${movieName}`);
    
    // Click on search input to focus
    await this.click(this.selectors.searchInput);
    
    // Type the movie name
    await this.type(this.selectors.searchInput, movieName, { delay: 100 });
    
    // Wait for suggestions to appear
    await this.waitForSearchSuggestions();
    
    return this;
  }

  /**
   * Wait for search suggestions to appear
   */
  async waitForSearchSuggestions() {
    try {
      await this.waitForSelector(this.selectors.searchSuggestions, { timeout: 5000 });
      // Wait a bit for all suggestions to load
      await this.sleep(500);
    } catch {
      this.log('No search suggestions appeared');
    }
  }

  /**
   * Select a movie from search suggestions
   */
  async selectFromSuggestions(movieName) {
    const suggestions = await this.getAll(this.selectors.searchSuggestionItem);
    
    for (const suggestion of suggestions) {
      const text = await suggestion.textContent();
      if (text?.toLowerCase().includes(movieName.toLowerCase())) {
        await suggestion.click();
        this.log(`Selected from suggestions: ${text}`);
        return true;
      }
    }
    
    return false;
  }

  // ============================================
  // MOVIE SELECTION
  // ============================================

  /**
   * Find and select a movie from the listing
   * 
   * LEARNING: Complex element finding with multiple attributes
   */
  async selectMovie(movieName) {
    this.log(`Looking for movie: ${movieName}`);
    
    // First try search
    await this.searchMovie(movieName);
    const selectedFromSuggestions = await this.selectFromSuggestions(movieName);
    
    if (selectedFromSuggestions) {
      await this.waitForNavigation();
      return true;
    }
    
    // Fall back to browsing movie cards
    return await this.selectMovieFromCards(movieName);
  }

  /**
   * Select movie from visible movie cards
   */
  async selectMovieFromCards(movieName) {
    const movieCards = await this.getAll(this.selectors.movieCard);
    this.log(`Found ${movieCards.length} movie cards`);
    
    for (const card of movieCards) {
      const titleElement = card.locator(this.selectors.movieTitle);
      const title = await titleElement.textContent();
      
      if (title?.toLowerCase().includes(movieName.toLowerCase())) {
        this.log(`Found movie: ${title}`);
        
        // Click the book button within this card
        const bookButton = card.locator(this.selectors.bookButton);
        
        if (await bookButton.isVisible()) {
          await bookButton.click();
        } else {
          // Click the card itself
          await card.click();
        }
        
        await this.waitForNavigation();
        return true;
      }
    }
    
    this.log(`Movie "${movieName}" not found in visible cards`);
    return false;
  }

  /**
   * Get all visible movies
   */
  async getVisibleMovies() {
    const movies = [];
    const movieCards = await this.getAll(this.selectors.movieCard);
    
    for (const card of movieCards) {
      const title = await card.locator(this.selectors.movieTitle).textContent();
      const rating = await card.locator(this.selectors.movieRating).textContent().catch(() => null);
      const genre = await card.locator(this.selectors.movieGenre).textContent().catch(() => null);
      
      movies.push({ title, rating, genre });
    }
    
    return movies;
  }

  // ============================================
  // DATE SELECTION
  // ============================================

  /**
   * Select a date from the date picker
   * 
   * LEARNING: Working with date components
   */
  async selectDate(dateString) {
    this.log(`Selecting date: ${dateString}`);
    
    // Parse the date
    const targetDate = new Date(dateString);
    const day = targetDate.getDate();
    const month = targetDate.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    
    // Click date picker if it's collapsed
    if (await this.isVisible(this.selectors.datePicker)) {
      await this.click(this.selectors.datePicker);
    }
    
    // Find the date option
    // Different sites structure dates differently
    const dateSelectors = [
      `[data-date="${dateString}"]`,
      `[data-testid="date-${day}"]`,
      `.date-option:has-text("${day}")`,
    ];
    
    for (const selector of dateSelectors) {
      if (await this.isVisible(selector)) {
        await this.click(selector);
        this.log(`Selected date using selector: ${selector}`);
        return true;
      }
    }
    
    // Try clicking by text
    const dateOptions = await this.getAll(this.selectors.dateOption);
    for (const option of dateOptions) {
      const text = await option.textContent();
      if (text?.includes(String(day))) {
        await option.click();
        return true;
      }
    }
    
    return false;
  }

  // ============================================
  // LOCATION
  // ============================================

  /**
   * Set the location/city
   */
  async setLocation(location) {
    this.log(`Setting location: ${location}`);
    
    await this.click(this.selectors.locationButton);
    await this.fill(this.selectors.locationInput, location);
    
    // Wait for location suggestions
    await this.sleep(500);
    
    // Select first matching location
    const locationOptions = await this.getAll(this.selectors.locationOption);
    for (const option of locationOptions) {
      const text = await option.textContent();
      if (text?.toLowerCase().includes(location.toLowerCase())) {
        await option.click();
        await this.waitForNetworkIdle();
        return true;
      }
    }
    
    return false;
  }

  // ============================================
  // FILTERS
  // ============================================

  /**
   * Apply language filter
   */
  async filterByLanguage(language) {
    this.log(`Filtering by language: ${language}`);
    
    await this.click(this.selectors.languageFilter);
    await this.click(`[data-language="${language}"], text=${language}`);
    await this.waitForNetworkIdle();
  }

  /**
   * Apply format filter (2D, 3D, IMAX, etc.)
   */
  async filterByFormat(format) {
    this.log(`Filtering by format: ${format}`);
    
    await this.click(this.selectors.formatFilter);
    await this.click(`[data-format="${format}"], text=${format}`);
    await this.waitForNetworkIdle();
  }

  // ============================================
  // PAGE STATE CHECKS
  // ============================================

  /**
   * Check if movie is available
   */
  async isMovieAvailable(movieName) {
    const movies = await this.getVisibleMovies();
    return movies.some(m => 
      m.title?.toLowerCase().includes(movieName.toLowerCase())
    );
  }

  /**
   * Get selected date
   */
  async getSelectedDate() {
    const selectedDate = this.page.locator(this.selectors.selectedDate);
    if (await selectedDate.isVisible()) {
      return await selectedDate.textContent();
    }
    return null;
  }
}

export default HomePage;
