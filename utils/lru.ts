// utils/lru.ts
export class LruTTL<K, V> {
  private max: number;
  private ttlMs: number;
  private map = new Map<K, { v: V; t: number }>();

  constructor(max = 500, ttlMs = 30 * 60 * 1000) {
    this.max = max;
    this.ttlMs = ttlMs;
  }

  get(k: K): V | undefined {
    const e = this.map.get(k);
    if (!e) return;
    if (Date.now() - e.t > this.ttlMs) {
      this.map.delete(k);
      return;
    }
    this.map.delete(k);            // bump LRU
    this.map.set(k, e);
    return e.v;
  }

  set(k: K, v: V) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, { v, t: Date.now() });
    if (this.map.size > this.max) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
  }
}
