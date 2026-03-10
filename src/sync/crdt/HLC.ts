/**
 * Hybrid Logical Clock implementation.
 * Combines wall clock time with a logical counter for causal ordering.
 * Format: "wallTimeMs-counter-nodeId"
 * Example: "1709553045123-0001-+919876543210"
 */

export interface HLCTimestamp {
  wallTime: number;
  counter: number;
  nodeId: string;
}

export class HLC {
  private current: HLCTimestamp;

  constructor(private nodeId: string) {
    this.current = {
      wallTime: Date.now(),
      counter: 0,
      nodeId,
    };
  }

  /**
   * Generate a new timestamp for a local event.
   */
  now(): HLCTimestamp {
    const physicalTime = Date.now();

    if (physicalTime > this.current.wallTime) {
      this.current = {
        wallTime: physicalTime,
        counter: 0,
        nodeId: this.nodeId,
      };
    } else {
      this.current = {
        wallTime: this.current.wallTime,
        counter: this.current.counter + 1,
        nodeId: this.nodeId,
      };
    }

    return {...this.current};
  }

  /**
   * Update local clock upon receiving a remote timestamp.
   */
  receive(remote: HLCTimestamp): HLCTimestamp {
    const physicalTime = Date.now();
    const maxWall = Math.max(physicalTime, this.current.wallTime, remote.wallTime);

    if (maxWall === physicalTime && maxWall > this.current.wallTime && maxWall > remote.wallTime) {
      this.current = {wallTime: maxWall, counter: 0, nodeId: this.nodeId};
    } else if (maxWall === this.current.wallTime && maxWall === remote.wallTime) {
      this.current = {
        wallTime: maxWall,
        counter: Math.max(this.current.counter, remote.counter) + 1,
        nodeId: this.nodeId,
      };
    } else if (maxWall === this.current.wallTime) {
      this.current = {
        wallTime: maxWall,
        counter: this.current.counter + 1,
        nodeId: this.nodeId,
      };
    } else if (maxWall === remote.wallTime) {
      this.current = {
        wallTime: maxWall,
        counter: remote.counter + 1,
        nodeId: this.nodeId,
      };
    }

    return {...this.current};
  }

  static serialize(ts: HLCTimestamp): string {
    const counter = ts.counter.toString().padStart(4, '0');
    return `${ts.wallTime}-${counter}-${ts.nodeId}`;
  }

  static deserialize(s: string): HLCTimestamp {
    const firstDash = s.indexOf('-');
    if (firstDash === -1) {
      // Raw millisecond timestamp (e.g. from Date.now().toString())
      return {wallTime: parseInt(s, 10) || 0, counter: 0, nodeId: ''};
    }
    const secondDash = s.indexOf('-', firstDash + 1);
    if (secondDash === -1) {
      return {
        wallTime: parseInt(s.substring(0, firstDash), 10) || 0,
        counter: parseInt(s.substring(firstDash + 1), 10) || 0,
        nodeId: '',
      };
    }
    return {
      wallTime: parseInt(s.substring(0, firstDash), 10),
      counter: parseInt(s.substring(firstDash + 1, secondDash), 10),
      nodeId: s.substring(secondDash + 1),
    };
  }

  static compare(a: HLCTimestamp, b: HLCTimestamp): -1 | 0 | 1 {
    if (a.wallTime !== b.wallTime) return a.wallTime < b.wallTime ? -1 : 1;
    if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
    if (a.nodeId !== b.nodeId) return a.nodeId < b.nodeId ? -1 : 1;
    return 0;
  }

  static compareStr(a: string, b: string): -1 | 0 | 1 {
    return HLC.compare(HLC.deserialize(a), HLC.deserialize(b));
  }

  static max(a: string, b: string): string {
    return HLC.compareStr(a, b) >= 0 ? a : b;
  }
}
