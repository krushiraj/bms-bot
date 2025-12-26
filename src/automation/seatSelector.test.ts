import { describe, it, expect } from 'vitest';
import {
  scoreSeat,
  findConsecutiveGroups,
  findBestAdjacentSeats,
  meetsMinimumScore,
  SeatLayout,
  SeatPrefs,
  Seat,
} from './seatSelector.js';

function createSeat(row: string, number: number, status: 'available' | 'sold' = 'available'): Seat {
  return { id: `${row}-${number}`, row, number, status, price: 200 };
}

function createRow(id: string, rowNumber: number, seatCount: number, soldSeats: number[] = []) {
  const seats: Seat[] = [];
  for (let i = 1; i <= seatCount; i++) {
    seats.push(createSeat(id, i, soldSeats.includes(i) ? 'sold' : 'available'));
  }
  return { id, rowNumber, seats };
}

describe('seatSelector', () => {
  describe('scoreSeat', () => {
    const layout: SeatLayout = {
      rows: [
        createRow('A', 1, 20), createRow('B', 2, 20), createRow('C', 3, 20),
        createRow('D', 4, 20), createRow('E', 5, 20), createRow('F', 6, 20),
        createRow('G', 7, 20), createRow('H', 8, 20), createRow('I', 9, 20),
        createRow('J', 10, 20),
      ],
      totalRows: 10,
      maxSeatsPerRow: 20,
      categories: ['Standard'],
    };

    const prefs: SeatPrefs = {
      count: 2, avoidBottomRows: 3, preferCenter: true, needAdjacent: true,
    };

    it('should score center seats higher than edge seats', () => {
      const centerSeat = createSeat('H', 10);
      const edgeSeat = createSeat('H', 1);
      expect(scoreSeat(centerSeat, layout, prefs)).toBeGreaterThan(scoreSeat(edgeSeat, layout, prefs));
    });

    it('should penalize front rows', () => {
      const frontSeat = createSeat('A', 10);
      const backSeat = createSeat('H', 10);
      expect(scoreSeat(backSeat, layout, prefs)).toBeGreaterThan(scoreSeat(frontSeat, layout, prefs));
      expect(scoreSeat(frontSeat, layout, prefs)).toBeLessThan(0.2);
    });

    it('should return score between 0 and 1', () => {
      for (const row of layout.rows) {
        for (const seat of row.seats) {
          const score = scoreSeat(seat, layout, prefs);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('findConsecutiveGroups', () => {
    it('should find consecutive available seats', () => {
      const seats = [createSeat('H', 1), createSeat('H', 2), createSeat('H', 3), createSeat('H', 4), createSeat('H', 5)];
      const groups = findConsecutiveGroups(seats, 2);
      expect(groups.length).toBe(4);
    });

    it('should skip sold seats', () => {
      const seats = [createSeat('H', 1), createSeat('H', 2, 'sold'), createSeat('H', 3), createSeat('H', 4)];
      const groups = findConsecutiveGroups(seats, 2);
      expect(groups.length).toBe(1);
      expect(groups[0]![0]!.number).toBe(3);
    });

    it('should return empty array if not enough consecutive seats', () => {
      const seats = [createSeat('H', 1), createSeat('H', 3), createSeat('H', 5)];
      expect(findConsecutiveGroups(seats, 2).length).toBe(0);
    });
  });

  describe('findBestAdjacentSeats', () => {
    it('should find best seats in center of theatre', () => {
      const layout: SeatLayout = {
        rows: [
          createRow('A', 1, 10), createRow('B', 2, 10), createRow('C', 3, 10),
          createRow('D', 4, 10), createRow('E', 5, 10), createRow('F', 6, 10),
          createRow('G', 7, 10), createRow('H', 8, 10),
        ],
        totalRows: 8, maxSeatsPerRow: 10, categories: ['Standard'],
      };
      const prefs: SeatPrefs = { count: 2, avoidBottomRows: 2, preferCenter: true, needAdjacent: true };
      const result = findBestAdjacentSeats(layout, prefs);

      expect(result).not.toBeNull();
      expect(result!.seats.length).toBe(2);
      expect(['D', 'E', 'F']).toContain(result!.seats[0]!.row);
    });

    it('should return null if no seats available', () => {
      const layout: SeatLayout = {
        rows: [createRow('A', 1, 5, [1, 2, 3, 4, 5])],
        totalRows: 1, maxSeatsPerRow: 5, categories: ['Standard'],
      };
      const prefs: SeatPrefs = { count: 2, avoidBottomRows: 0, preferCenter: true, needAdjacent: true };
      expect(findBestAdjacentSeats(layout, prefs)).toBeNull();
    });
  });

  describe('meetsMinimumScore', () => {
    it('should return true for good seats', () => {
      expect(meetsMinimumScore({ seats: [], avgScore: 0.75 }, 0.4)).toBe(true);
    });

    it('should return false for poor seats', () => {
      expect(meetsMinimumScore({ seats: [], avgScore: 0.2 }, 0.4)).toBe(false);
    });
  });
});
