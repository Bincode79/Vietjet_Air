import { describe, expect, it } from 'vitest';
import {
  classifySeatLocks,
  partitionSeatLocks,
  SeatLockConflictError,
  type SeatLockRow,
} from '@/lib/seat-lock';

describe('seat lock enforcement', () => {
  const futureExpiry = new Date(Date.now() + 600000).toISOString();
  const pastExpiry = new Date(Date.now() - 60000).toISOString();

  it('marks empty locks as none', () => {
    const verdicts = classifySeatLocks([], ['12A', '12B'], 'token-me');
    expect(verdicts).toEqual([
      { seatNumber: '12A', verdict: 'none' },
      { seatNumber: '12B', verdict: 'none' },
    ]);
  });

  it('recognizes locks held by the current session as held', () => {
    const lockRows: SeatLockRow[] = [
      { seat_number: '12A', owner_token: 'token-me', expires_at: futureExpiry },
    ];
    const verdicts = classifySeatLocks(lockRows, ['12A'], 'token-me');
    expect(verdicts).toEqual([{ seatNumber: '12A', verdict: 'held' }]);

    const { blocked, allowed } = partitionSeatLocks(verdicts);
    expect(blocked).toEqual([]);
    expect(allowed).toEqual(['12A']);
  });

  it('recognizes locks held by other sessions as foreign and blocks them', () => {
    const lockRows: SeatLockRow[] = [
      { seat_number: '12A', owner_token: 'token-other', expires_at: futureExpiry },
    ];
    const verdicts = classifySeatLocks(lockRows, ['12A'], 'token-me');
    expect(verdicts).toEqual([{ seatNumber: '12A', verdict: 'foreign' }]);

    const { blocked, allowed } = partitionSeatLocks(verdicts);
    expect(blocked).toEqual(['12A']);
    expect(allowed).toEqual([]);
  });

  it('treats missing session as foreign if seat is locked by someone else', () => {
    const lockRows: SeatLockRow[] = [
      { seat_number: '14C', owner_token: 'token-other', expires_at: futureExpiry },
    ];
    const verdicts = classifySeatLocks(lockRows, ['14C'], null);
    expect(verdicts).toEqual([{ seatNumber: '14C', verdict: 'foreign' }]);
  });

  it('treats orphan locks (owner_token null) as none so they do not block anyone', () => {
    const lockRows: SeatLockRow[] = [
      { seat_number: '15D', owner_token: null, expires_at: futureExpiry },
    ];
    const verdicts = classifySeatLocks(lockRows, ['15D'], 'token-me');
    expect(verdicts).toEqual([{ seatNumber: '15D', verdict: 'none' }]);
  });

  it('treats expired locks as none', () => {
    const lockRows: SeatLockRow[] = [
      { seat_number: '16E', owner_token: 'token-other', expires_at: pastExpiry },
    ];
    const verdicts = classifySeatLocks(lockRows, ['16E'], 'token-me');
    expect(verdicts).toEqual([{ seatNumber: '16E', verdict: 'none' }]);
  });

  it('instantiates SeatLockConflictError with blocked seats list', () => {
    const err = new SeatLockConflictError(['12A', '12B']);
    expect(err.name).toBe('SeatLockConflictError');
    expect(err.seats).toEqual(['12A', '12B']);
    expect(err.message).toBe('Seat held by another customer');
  });
});
