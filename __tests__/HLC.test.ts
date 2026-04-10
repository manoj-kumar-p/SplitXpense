import {HLC} from '../src/sync/crdt/HLC';

describe('HLC', () => {
  describe('serialize/deserialize', () => {
    it('round-trips a normal timestamp', () => {
      const ts = {wallTime: 1700000000000, counter: 5, nodeId: '+919876543210'};
      const s = HLC.serialize(ts);
      expect(s).toBe('1700000000000-0005-+919876543210');
      const back = HLC.deserialize(s);
      expect(back).toEqual(ts);
    });

    it('pads counter to 4 digits', () => {
      const ts = {wallTime: 1, counter: 7, nodeId: 'a'};
      expect(HLC.serialize(ts)).toBe('1-0007-a');
    });

    it('handles raw millisecond timestamps from Date.now().toString()', () => {
      const back = HLC.deserialize('1700000000000');
      expect(back).toEqual({wallTime: 1700000000000, counter: 0, nodeId: ''});
    });

    it('handles partial timestamps without nodeId', () => {
      const back = HLC.deserialize('1700000000000-0042');
      expect(back).toEqual({wallTime: 1700000000000, counter: 42, nodeId: ''});
    });
  });

  describe('compare', () => {
    it('orders by wall time first', () => {
      const a = {wallTime: 100, counter: 99, nodeId: 'z'};
      const b = {wallTime: 200, counter: 0, nodeId: 'a'};
      expect(HLC.compare(a, b)).toBe(-1);
      expect(HLC.compare(b, a)).toBe(1);
    });

    it('breaks ties by counter', () => {
      const a = {wallTime: 100, counter: 1, nodeId: 'z'};
      const b = {wallTime: 100, counter: 2, nodeId: 'a'};
      expect(HLC.compare(a, b)).toBe(-1);
    });

    it('breaks counter ties by nodeId', () => {
      const a = {wallTime: 100, counter: 1, nodeId: 'a'};
      const b = {wallTime: 100, counter: 1, nodeId: 'b'};
      expect(HLC.compare(a, b)).toBe(-1);
    });

    it('returns 0 for identical timestamps', () => {
      const a = {wallTime: 100, counter: 1, nodeId: 'a'};
      expect(HLC.compare(a, {...a})).toBe(0);
    });
  });

  describe('compareStr', () => {
    it('compares serialized strings without manual parsing', () => {
      const a = '1700000000000-0001-peerA';
      const b = '1700000000001-0000-peerB';
      expect(HLC.compareStr(a, b)).toBe(-1);
    });
  });

  describe('max', () => {
    it('returns the larger of two HLC strings', () => {
      const a = '1700000000000-0001-peerA';
      const b = '1700000000001-0000-peerB';
      expect(HLC.max(a, b)).toBe(b);
      expect(HLC.max(b, a)).toBe(b);
    });
  });

  describe('now()', () => {
    it('produces monotonically increasing timestamps within the same millisecond', () => {
      const clock = new HLC('peerA');
      const t1 = clock.now();
      const t2 = clock.now();
      const t3 = clock.now();
      expect(HLC.compare(t1, t2)).toBe(-1);
      expect(HLC.compare(t2, t3)).toBe(-1);
    });

    it('resets counter when wall time advances', () => {
      const clock = new HLC('peerA');
      const t1 = clock.now();
      // Force wall time forward
      const realDateNow = Date.now;
      Date.now = () => t1.wallTime + 100;
      try {
        const t2 = clock.now();
        expect(t2.wallTime).toBeGreaterThan(t1.wallTime);
        expect(t2.counter).toBe(0);
      } finally {
        Date.now = realDateNow;
      }
    });
  });

  describe('receive()', () => {
    it('advances local clock past remote wall time', () => {
      const clock = new HLC('peerA');
      const remote = {wallTime: Date.now() + 100000, counter: 5, nodeId: 'peerB'};
      const merged = clock.receive(remote);
      expect(merged.wallTime).toBeGreaterThanOrEqual(remote.wallTime);
    });
  });
});
