// Browser management
export { launchBrowser, createContext, createPage, closeBrowser, takeScreenshot } from './browser.js';

// Page objects
export { BasePage } from './pages/BasePage.js';
export { HomePage } from './pages/HomePage.js';
export { ShowtimesPage } from './pages/ShowtimesPage.js';
export { SeatPage } from './pages/SeatPage.js';
export { PaymentPage } from './pages/PaymentPage.js';

// Seat selection
export {
  Seat,
  Row,
  SeatLayout,
  SeatPrefs,
  SeatGroup,
  scoreSeat,
  findConsecutiveGroups,
  findBestAdjacentSeats,
  meetsMinimumScore,
} from './seatSelector.js';

// Booking flow
export { BookingFlow, BookingConfig, BookingAttemptResult } from './bookingFlow.js';
