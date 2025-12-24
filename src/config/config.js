/**
 * Configuration for Movie Booking Automation
 * 
 * LEARNING CONCEPT: Centralized Configuration
 * --------------------------------------------
 * All configurable values are kept in one place. This makes the code:
 * - Easy to modify without touching business logic
 * - Environment-aware (dev vs prod)
 * - Testable with different configurations
 */

// Helper to get environment variable with default
const env = (key, defaultValue) => process.env[key] ?? defaultValue;

export const config = {
  // ============================================
  // MOVIE CONFIGURATION
  // ============================================
  movie: {
    // The movie you want to book
    name: env('MOVIE_NAME', 'Inception'),
    
    // Target date (YYYY-MM-DD format)
    date: env('MOVIE_DATE', '2024-12-25'),
    
    // Preferred showtimes in priority order
    // The automation will try the first one, then fall back to others
    preferredShowtimes: ['10:00 AM', '10:30 AM', '11:00 AM', '02:00 PM'],
    
    // Language preference (if multiple versions available)
    language: 'English',
    
    // Format preference
    format: '2D', // Options: '2D', '3D', 'IMAX', '4DX', 'IMAX 3D'
  },

  // ============================================
  // THEATRE CONFIGURATION
  // ============================================
  theatres: {
    // List of theatres in priority order
    // Automation will check availability in this order
    preferred: [
      'PVR ICON: GVK One Mall, Banjara Hills',
      'INOX: GVK One, Banjara Hills',
      'PVR: Nexus Mall, Kukatpally',
      'AMB Cinemas: Gachibowli',
    ],
    
    // Maximum distance willing to travel (for future geo-filtering)
    maxDistanceKm: 15,
    
    // Preferred cinema chains
    preferredChains: ['PVR', 'INOX', 'AMB'],
  },

  // ============================================
  // SEAT CONFIGURATION
  // ============================================
  seats: {
    // Number of tickets to book
    count: 2,
    
    // Seat selection strategy
    // Options: 'center', 'aisle', 'back', 'front', 'custom'
    preference: 'center',
    
    // Preferred rows (in priority order)
    // Rows are typically A-Z from front to back
    preferredRows: ['H', 'I', 'J', 'G', 'K', 'F', 'L'],
    
    // For 'center' preference: what counts as center?
    // This is the percentage of seats from the middle
    centerThreshold: 0.3, // 30% from center on each side
    
    // Should seats be consecutive?
    mustBeConsecutive: true,
    
    // Category preference
    category: 'PRIME', // Options: 'PRIME', 'CLASSIC', 'RECLINER', 'any'
    
    // Maximum price per ticket (0 for no limit)
    maxPricePerTicket: 500,
  },

  // ============================================
  // BROWSER CONFIGURATION
  // ============================================
  browser: {
    // Run in headless mode? (no visible browser window)
    headless: env('HEADLESS', 'true') === 'true',
    
    // Slow down actions by this many milliseconds (for debugging)
    slowMo: parseInt(env('SLOW_MO', '0')),
    
    // Browser to use: 'chromium', 'firefox', 'webkit'
    browserType: 'chromium',
    
    // Viewport size
    viewport: {
      width: 1280,
      height: 720,
    },
    
    // Default timeout for actions (milliseconds)
    defaultTimeout: 30000,
    
    // Navigation timeout
    navigationTimeout: 60000,
    
    // Take screenshots on failure?
    screenshotOnFailure: true,
    
    // Screenshots directory
    screenshotsDir: './screenshots',
    
    // Record video?
    recordVideo: env('RECORD_VIDEO', 'false') === 'true',
  },

  // ============================================
  // RETRY CONFIGURATION
  // ============================================
  retry: {
    // How many times to retry on failure
    maxAttempts: 3,
    
    // Delay between retries (milliseconds)
    delayBetweenRetries: 2000,
    
    // Should we refresh the page between retries?
    refreshOnRetry: true,
  },

  // ============================================
  // TIMING CONFIGURATION
  // ============================================
  timing: {
    // How often to check for seat availability (milliseconds)
    pollInterval: 1000,
    
    // How long to wait for seats page to load
    seatsLoadTimeout: 15000,
    
    // Time to wait before selecting seats (lets page stabilize)
    preSelectionDelay: 500,
  },

  // ============================================
  // NOTIFICATION CONFIGURATION
  // ============================================
  notifications: {
    // Enable console logging
    enableConsole: true,
    
    // Log level: 'debug', 'info', 'warn', 'error'
    logLevel: env('LOG_LEVEL', 'info'),
    
    // Play sound on success/failure (if supported)
    enableSound: false,
  },

  // ============================================
  // MOCK SITE CONFIGURATION (for learning)
  // ============================================
  mockSite: {
    baseUrl: 'http://localhost:3000',
    enabled: env('USE_MOCK', 'true') === 'true',
  },
};

// ============================================
// CONFIGURATION VALIDATION
// ============================================
export function validateConfig() {
  const errors = [];
  
  if (config.seats.count < 1 || config.seats.count > 10) {
    errors.push('Seat count must be between 1 and 10');
  }
  
  if (config.theatres.preferred.length === 0) {
    errors.push('At least one theatre must be specified');
  }
  
  if (!config.movie.name) {
    errors.push('Movie name is required');
  }
  
  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(config.movie.date)) {
    errors.push('Movie date must be in YYYY-MM-DD format');
  }
  
  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    throw new Error('Invalid configuration');
  }
  
  return true;
}

// Export a frozen config to prevent accidental mutations
export default Object.freeze(config);
