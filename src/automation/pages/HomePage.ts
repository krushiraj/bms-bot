import { Page } from 'playwright';
import { BasePage } from './BasePage.js';
import { logger } from '../../utils/logger.js';

export class HomePage extends BasePage {
  private baseUrl = 'https://in.bookmyshow.com';

  // Selectors
  private selectors = {
    searchInput: 'input[placeholder*="Search"]',
    searchResults: '.sc-7o7nez-0', // Movie search results container
    movieCard: '[data-testid="movie-card"]',
    movieTitle: '.bwgNvN', // Movie title in search
    citySelector: '[data-testid="city-selector"]',
    currentCity: '.sc-fihHvN',
  };

  constructor(page: Page) {
    super(page, 'HomePage');
  }

  async navigate(city = 'hyderabad'): Promise<void> {
    try {
      const url = `${this.baseUrl}/explore/home/${city}`;
      logger.info('Navigating to BMS', { url });
      await this.page.goto(url, { timeout: 30000 });
      await this.waitForLoad();
    } catch (error) {
      logger.error('Failed to navigate to home page', { city, error });
      throw error;
    }
  }

  async searchMovie(movieName: string): Promise<void> {
    try {
      logger.info('Searching for movie', { movieName });

      const searchInput = this.page.locator(this.selectors.searchInput).first();
      await searchInput.waitFor({ state: 'visible', timeout: 10000 });
      await searchInput.click();
      await searchInput.fill(movieName);

      // Wait for search results to appear instead of hardcoded delay
      await this.page.waitForTimeout(500); // Brief wait for typing to complete
      await this.page.locator(this.selectors.searchResults).first().waitFor({
        state: 'visible',
        timeout: 5000
      }).catch(() => {
        // Results container might not match, continue anyway
        logger.debug('Search results container not found, continuing');
      });
    } catch (error) {
      logger.error('Failed to search for movie', { movieName, error });
      throw error;
    }
  }

  async selectMovieFromSearch(movieName: string): Promise<boolean> {
    try {
      logger.info('Selecting movie from search results', { movieName });

      // Scope to search results area for more reliable selection
      const movieLinks = this.page.locator('a').filter({ hasText: movieName });

      const count = await movieLinks.count();
      if (count === 0) {
        logger.warn('Movie not found in search results', { movieName });
        return false;
      }

      await movieLinks.first().click();
      await this.waitForLoad();

      logger.info('Movie selected', { movieName });
      return true;
    } catch (error) {
      logger.error('Failed to select movie from search', { movieName, error });
      return false;
    }
  }

  async navigateToMovie(movieSlug: string, city = 'hyderabad'): Promise<void> {
    try {
      const url = `${this.baseUrl}/explore/movies/${movieSlug}/${city}`;
      logger.info('Navigating directly to movie', { url });
      await this.page.goto(url, { timeout: 30000 });
      await this.waitForLoad();
    } catch (error) {
      logger.error('Failed to navigate to movie page', { movieSlug, error });
      throw error;
    }
  }

  async getCurrentCity(): Promise<string> {
    try {
      const cityElement = this.page.locator(this.selectors.currentCity).first();
      return await cityElement.textContent() ?? '';
    } catch (error) {
      logger.debug('Failed to get current city', { error });
      return '';
    }
  }

  async isMoviePageLoaded(): Promise<boolean> {
    // Check if we're on a movie details page
    const url = this.page.url();
    return url.includes('/movies/') || url.includes('/events/');
  }
}
