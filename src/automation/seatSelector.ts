export interface Seat {
  id: string;           // e.g., "H-12"
  row: string;          // e.g., "H"
  number: number;       // e.g., 12
  status: 'available' | 'sold' | 'blocked';
  price: number;
  category?: string;    // e.g., "Recliner", "Premium"
}

export interface Row {
  id: string;           // e.g., "H"
  rowNumber: number;    // 1-indexed from screen
  seats: Seat[];
}

export interface SeatLayout {
  rows: Row[];
  totalRows: number;
  maxSeatsPerRow: number;
  categories: string[];
}

export interface SeatPrefs {
  count: number;
  category?: string;
  avoidBottomRows: number;    // Skip first N rows
  preferCenter: boolean;
  needAdjacent: boolean;
}

export interface SeatScore {
  seat: Seat;
  score: number;
}

export interface SeatGroup {
  seats: Seat[];
  avgScore: number;
  totalPrice?: number;
}

/**
 * Score a single seat based on position preferences
 * Returns 0-1 (higher is better)
 *
 * Scoring Logic (Circular with Upper Bias):
 * - CENTER seat (vertically and horizontally) is the "bullseye" - highest score
 * - Score decreases as you move away from center (like a circle)
 * - When equidistant from center:
 *   - UPPER sector (above center) is preferred
 *   - LEFT/RIGHT sectors (same level as center) are next
 *   - LOWER sector (below center) is least preferred
 * - Front N rows are avoided completely (too close to screen)
 *
 * Priority: Center > Upper-Near > Side-Near > Lower-Near > Upper-Far > Side-Far > Lower-Far
 */
export function scoreSeat(
  seat: Seat,
  layout: SeatLayout,
  prefs: SeatPrefs
): number {
  const { totalRows, maxSeatsPerRow } = layout;
  const row = layout.rows.find((r) => r.id === seat.row);
  if (!row) return 0;

  const rowNumber = row.rowNumber;

  // Avoid bottom N rows (too close to screen)
  const minRow = prefs.avoidBottomRows;
  const usableRows = totalRows - minRow;

  if (usableRows <= 0) {
    return 0.1; // No usable rows, return minimal score
  }

  if (rowNumber <= minRow) {
    return 0.05; // Penalize front rows heavily
  }

  // Calculate ideal center position (the "bullseye")
  // Vertical center: middle of usable rows (slightly towards back for comfort)
  const idealRow = minRow + usableRows * 0.55; // 55% into usable area
  // Horizontal center: middle of row
  const centerSeat = maxSeatsPerRow / 2;

  if (maxSeatsPerRow === 0) {
    return 0;
  }

  // Calculate distance from center
  const rowPosition = rowNumber - minRow;
  const verticalDistance = Math.abs(rowPosition - (usableRows * 0.55)) / usableRows;
  const horizontalDistance = Math.abs(seat.number - centerSeat) / (maxSeatsPerRow / 2);

  // Combined circular distance (Euclidean-like)
  const circularDistance = Math.sqrt(
    verticalDistance * verticalDistance + horizontalDistance * horizontalDistance
  );

  // Base score from distance (1.0 at center, decreasing outward)
  const distanceScore = Math.max(0, 1 - circularDistance * 0.7);

  // Upper sector bias: seats above ideal row get a bonus, below get a penalty
  let verticalBias = 0;
  if (rowPosition > usableRows * 0.55) {
    // Above center (upper sector) - bonus
    const aboveRatio = (rowPosition - usableRows * 0.55) / (usableRows * 0.45);
    verticalBias = Math.min(0.15, aboveRatio * 0.15); // Up to 15% bonus
  } else if (rowPosition < usableRows * 0.55) {
    // Below center (lower sector) - penalty
    const belowRatio = (usableRows * 0.55 - rowPosition) / (usableRows * 0.55);
    verticalBias = -Math.min(0.15, belowRatio * 0.15); // Up to 15% penalty
  }

  // Corner penalty (more severe for lower corners)
  const isCorner = seat.number <= 2 || seat.number >= maxSeatsPerRow - 1;
  const isLowerHalf = rowPosition < usableRows * 0.5;
  let cornerPenalty = 0;
  if (isCorner) {
    cornerPenalty = isLowerHalf ? 0.2 : 0.08;
  }

  const score = distanceScore + verticalBias - cornerPenalty;
  return Math.max(0, Math.min(1, score));
}

/**
 * Find consecutive available seats in a row
 */
export function findConsecutiveGroups(
  seats: Seat[],
  count: number
): Seat[][] {
  const groups: Seat[][] = [];
  const available = seats
    .filter((s) => s.status === 'available')
    .sort((a, b) => a.number - b.number);

  for (let i = 0; i <= available.length - count; i++) {
    const group = available.slice(i, i + count);

    let isConsecutive = true;
    for (let j = 1; j < group.length; j++) {
      const current = group[j];
      const previous = group[j - 1];
      if (current && previous && current.number !== previous.number + 1) {
        isConsecutive = false;
        break;
      }
    }

    if (isConsecutive) {
      groups.push(group);
    }
  }

  return groups;
}

/**
 * Find the best group of adjacent seats
 */
export function findBestAdjacentSeats(
  layout: SeatLayout,
  prefs: SeatPrefs
): SeatGroup | null {
  const candidates: SeatGroup[] = [];

  for (const row of layout.rows) {
    let seats = row.seats;
    if (prefs.category) {
      seats = seats.filter((s) => s.category === prefs.category);
    }

    const groups = findConsecutiveGroups(seats, prefs.count);

    for (const group of groups) {
      const scores = group.map((seat) => scoreSeat(seat, layout, prefs));
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      candidates.push({ seats: group, avgScore });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.avgScore - a.avgScore);
  return candidates[0] ?? null;
}

/**
 * Check if seat score meets minimum threshold
 */
export function meetsMinimumScore(
  group: SeatGroup,
  minScore = 0.4
): boolean {
  return group.avgScore >= minScore;
}
