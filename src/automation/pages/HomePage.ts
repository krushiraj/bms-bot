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
    const url = `${this.baseUrl}/explore/home/${city}`;
    logger.info('Navigating to BMS', { url });
    await this.page.goto(url);
    await this.waitForLoad();
  }

  async searchMovie(movieName: string): Promise<void> {
    logger.info('Searching for movie', { movieName });

    // Click search or find search input
    const searchInput = this.page.locator(this.selectors.searchInput).first();
    await searchInput.waitFor({ state: 'visible', timeout: 10000 });
    await searchInput.click();
    await searchInput.fill(movieName);

    // Wait for search results
    await this.delay(1000); // Allow search to process
  }

  async selectMovieFromSearch(movieName: string): Promise<boolean> {
    logger.info('Selecting movie from search results', { movieName });

    // Look for movie in results
    const movieLinks = this.page.locator('a').filter({ hasText: movieName });

    const count = await movieLinks.count();
    if (count === 0) {
      logger.warn('Movie not found in search results', { movieName });
      return false;
    }

    // Click the first matching result
    await movieLinks.first().click();
    await this.waitForLoad();

    logger.info('Movie selected', { movieName });
    return true;
  }

  async navigateToMovie(movieSlug: string, city = 'hyderabad'): Promise<void> {
    // Direct navigation to movie page
    const url = `${this.baseUrl}/explore/movies/${movieSlug}/${city}`;
    logger.info('Navigating directly to movie', { url });
    await this.page.goto(url);
    await this.waitForLoad();
  }

  async getCurrentCity(): Promise<string> {
    try {
      const cityElement = this.page.locator(this.selectors.currentCity).first();
      return await cityElement.textContent() ?? '';
    } catch {
      return '';
    }
  }

  async isMoviePageLoaded(): Promise<boolean> {
    // Check if we're on a movie details page
    const url = this.page.url();
    return url.includes('/movies/') || url.includes('/events/');
  }
}
