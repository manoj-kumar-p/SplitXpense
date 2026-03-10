import {HLC} from './HLC';

/**
 * Vector clock: maps each peer (phone number) to the latest HLC timestamp
 * seen from that peer.
 */
export type VectorClock = Record<string, string>;

/**
 * Merge two vector clocks, keeping the max HLC for each peer.
 */
export function mergeVectorClocks(local: VectorClock, remote: VectorClock): VectorClock {
  const merged: VectorClock = {...local};
  for (const [peer, hlc] of Object.entries(remote)) {
    if (!merged[peer] || HLC.compareStr(hlc, merged[peer]) > 0) {
      merged[peer] = hlc;
    }
  }
  return merged;
}

/**
 * Check if clock A has seen everything clock B has seen (A >= B).
 */
export function isAheadOrEqual(a: VectorClock, b: VectorClock): boolean {
  for (const [peer, hlc] of Object.entries(b)) {
    if (!a[peer] || HLC.compareStr(a[peer], hlc) < 0) {
      return false;
    }
  }
  return true;
}

/**
 * Get the minimum HLC value across all entries in the vector clock.
 * Returns empty string if clock is empty.
 */
export function getMinHLC(clock: VectorClock): string {
  const values = Object.values(clock);
  if (values.length === 0) return '';
  return values.reduce((min, val) => (HLC.compareStr(val, min) < 0 ? val : min));
}
