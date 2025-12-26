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
}

/**
 * Score a single seat based on position preferences
 * Returns 0-1 (higher is better)
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

  // Vertical score: prefer middle-back rows, avoid front
  const minRow = prefs.avoidBottomRows;
  const usableRows = totalRows - minRow;

  if (rowNumber <= minRow) {
    return 0.1; // Penalize front rows heavily
  }

  // Ideal row is about 40% into the usable zone
  const idealRow = minRow + usableRows * 0.4;
  const rowDistance = Math.abs(rowNumber - idealRow);
  const verticalScore = Math.max(0, 1 - rowDistance / usableRows);

  // Horizontal score: prefer center
  const centerSeat = maxSeatsPerRow / 2;
  const seatDistance = Math.abs(seat.number - centerSeat);
  const horizontalScore = Math.max(0, 1 - seatDistance / (maxSeatsPerRow / 2));

  // Corner penalty
  const isCorner =
    (rowNumber <= minRow + 2 || rowNumber >= totalRows - 1) &&
    (seat.number <= 2 || seat.number >= maxSeatsPerRow - 1);
  const cornerPenalty = isCorner ? 0.3 : 0;

  const score = (verticalScore * 0.5 + horizontalScore * 0.5) - cornerPenalty;
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
      if (group[j]!.number !== group[j - 1]!.number + 1) {
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
